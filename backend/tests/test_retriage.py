"""Tests for the re-triage suggestion logic (US-04).

Covers AC1-AC6, AC11 and AC12 of specs/020-retriage-suggestion-alerts/spec.md and
data-model.md: a saved reading whose stored risk band crosses up into the
medium/high band raises exactly one open suggestion alert (severity + suggested
level + reason), built from the stored band and never recomputing the score; the
app never changes the triage level on its own; the no-duplicate rule; and the
accept/dismiss helpers (manual triage event with no score on accept, acknowledge
only on dismiss). All-or-nothing on a forced failure.

Each test names the acceptance criterion it verifies (traceability, Principle I).
Uses an in-memory SQLite database and synthetic data only (fictitious patients,
PAT-NNN codes, made-up vital signs); no real database and no network. The stored
band is referred to as "the stored band" and the scoring result as "the score";
the literal scoring-system token is deliberately not used here so the
Principle V confinement guard (test_scoring_interface.py::test_news2_confined)
stays green.
"""

from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models import Alert, Base, Patient, ReadingScore, TriageEvent, User, VitalSign
from app.readings import record_reading
from app.retriage import (
    BAND_SEVERITY,
    BAND_STEP,
    accept_suggestion,
    build_message,
    dismiss_suggestion,
    evaluate_retriage,
    read_tag,
    reason_from_entries,
    strip_tag,
    suggested_level,
)
from app.scoring import PARAMETERS, VitalSigns, get_scoring_system

# Synthetic vital signs whose stored band is known. Each parameter scores 0 for
# the "low" reading; the medium/high readings reach the band thresholds
# (total >= 5 medium, total >= 7 high). The band is read from the scoring module
# in the fixtures so the tests never hard-code the threshold logic.
LOW_VITALS = VitalSigns(16, 97, False, 120, 72, "A", Decimal("36.8"))
# low-medium: a single parameter scores 3 (respiratory_rate 8) but the total < 5.
LOW_MEDIUM_VITALS = VitalSigns(8, 97, False, 120, 72, "A", Decimal("36.8"))
# medium: total 5 (rr +2, spo2 +1, hr +1, temp +1), no single parameter at 3.
MEDIUM_VITALS = VitalSigns(22, 95, False, 118, 96, "A", Decimal("38.4"))
# high: total >= 7 (rr +3, spo2 +3, hr +3).
HIGH_VITALS = VitalSigns(25, 91, False, 118, 131, "A", Decimal("38.4"))


@pytest.fixture
def engine():
    """An in-memory SQLite engine with all five TS-03 tables."""
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


def _band_of(vitals) -> str:
    """Return the band the scoring module assigns to ``vitals`` (sanity check for the fixtures)."""
    return get_scoring_system().score(vitals).band


def test_fixture_vitals_have_the_expected_bands():
    """Guard: the synthetic fixtures score the bands the other tests rely on."""
    assert _band_of(LOW_VITALS) == "low"
    assert _band_of(LOW_MEDIUM_VITALS) == "low-medium"
    assert _band_of(MEDIUM_VITALS) == "medium"
    assert _band_of(HIGH_VITALS) == "high"


def _add_patient(session, *, triage_level=3, status="active", code="PAT-001") -> Patient:
    """Add and flush one synthetic patient; return it."""
    patient = Patient(
        identifier=code, name=f"Paciente Ficticio {code}", age=50, sex="other",
        triage_level=triage_level, status=status,
    )
    session.add(patient)
    session.flush()
    return patient


def _add_user(session) -> User:
    """Add and flush one synthetic doctor; return it."""
    doctor = User(
        username="synthetic.doctor", password_hash="not-a-real-hash",
        full_name="Dr. Ficticio Prueba", role="doctor",
    )
    session.add(doctor)
    session.flush()
    return doctor


def _save(session, patient, vitals) -> ReadingScore:
    """Save a reading for ``patient`` through record_reading; return its stored score."""
    row = record_reading(session, patient.id, vitals)
    return session.scalars(
        select(ReadingScore).where(ReadingScore.vital_sign_id == row.id)
    ).one()


def _open_alerts(session, patient_id):
    return session.scalars(
        select(Alert).where(Alert.patient_id == patient_id).where(Alert.status == "open")
    ).all()


def _all_alerts(session, patient_id):
    return session.scalars(
        select(Alert).where(Alert.patient_id == patient_id).order_by(Alert.id)
    ).all()


def _count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


# --- AC1: a crossing into a more urgent band raises one suggestion --------------


def test_ac1_crossing_up_into_medium_raises_one_open_alert(engine):
    """AC1 (FR-001, FR-002): low-medium -> medium raises one open alert, severity medium,
    tag (medium, 2); the stored message carries only the tag + human sentence (no reason, CR2)."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_MEDIUM_VITALS)   # previous, less urgent
        _save(session, patient, MEDIUM_VITALS)       # crosses up

        alerts = _open_alerts(session, patient.id)
        assert len(alerts) == 1
        alert = alerts[0]
        assert alert.severity == "medium"
        assert read_tag(alert.message) == ("medium", 2)
        # CR2 (FR-021): the reason is no longer baked into the stored message; the
        # message is only the machine tag plus the fixed human sentence. No reason
        # text (no "<param> +<points>") and no raw vital value is in the message.
        human = strip_tag(alert.message)
        assert isinstance(human, str)
        assert " +" not in human
        for raw_value in ("22", "95", "96", "38.4"):
            assert raw_value not in alert.message


def test_ac24_reason_from_entries_is_structured_points_only(engine):
    """AC24 (FR-021): reason_from_entries returns a list of {parameter, points} for the
    scored reading, only parameters scoring > 0, in PARAMETERS order, with no vital value."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)
        high_score = _save(session, patient, HIGH_VITALS)

        reason = reason_from_entries(high_score.entries)
        # Every item is exactly {parameter, points} with points a positive int.
        assert reason  # HIGH_VITALS scores several parameters
        for item in reason:
            assert set(item) == {"parameter", "points"}
            assert isinstance(item["points"], int) and item["points"] > 0
            assert item["parameter"] in PARAMETERS
        # Only parameters that scored > 0 are present, matching the stored entries.
        scored = {
            e["parameter"] for e in high_score.entries if e.get("points", 0) > 0
        }
        assert {item["parameter"] for item in reason} == scored
        # The order follows PARAMETERS (no vital value, no extra keys).
        names = [item["parameter"] for item in reason]
        assert names == [name for name in PARAMETERS if name in scored]


# --- AC2: the app never changes the triage level on its own ---------------------


def test_ac2_no_level_change_and_no_automatic_event(engine):
    """AC2 (FR-005): after a crossing the triage level is unchanged and no source='automatic' event exists."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, HIGH_VITALS)

        session.refresh(patient)
        assert patient.triage_level == 3
        automatic = session.scalars(
            select(TriageEvent).where(TriageEvent.source == "automatic")
        ).all()
        assert automatic == []
        assert _count(session, TriageEvent) == 0


# --- AC3: no suggestion when the band does not become more urgent ---------------


def test_ac3_first_reading_raises_nothing(engine):
    """AC3 (FR-001): the first reading of a patient never raises a suggestion (no previous band)."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, HIGH_VITALS)
        assert _open_alerts(session, patient.id) == []


def test_ac3_same_or_less_urgent_raises_nothing(engine):
    """AC3 (FR-001): medium -> low and medium -> medium create no new suggestion for the later reading."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)       # previous
        _save(session, patient, MEDIUM_VITALS)    # crosses up -> one alert
        assert len(_open_alerts(session, patient.id)) == 1

        _save(session, patient, LOW_VITALS)       # medium -> low: no new alert
        _save(session, patient, MEDIUM_VITALS)    # low -> medium again, but an open
        # medium suggestion already exists, so still no second one (no-duplicate).
        assert len(_open_alerts(session, patient.id)) == 1


def test_ac3_crossing_into_low_medium_raises_nothing(engine):
    """AC3 (FR-002): a crossing low -> low-medium never raises (only medium/high do)."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, LOW_MEDIUM_VITALS)
        assert _open_alerts(session, patient.id) == []


# --- AC5 and the band mappings --------------------------------------------------


def test_build_message_takes_three_args_and_stores_no_reason():
    """CR2 (FR-004, FR-021): build_message(band, current, suggested) takes no reason arg;
    the stored message is the machine tag + human sentence only (read_tag/strip_tag round-trip)."""
    message = build_message("high", 3, 1)
    assert read_tag(message) == ("high", 1)
    human = strip_tag(message)
    assert isinstance(human, str)
    # No reason line and no "<param> +<points>" fragment is baked into the message.
    assert "\n" not in message
    assert " +" not in human
    # strip_tag of an untagged message returns the message unchanged (a str).
    assert strip_tag("no tag here") == "no tag here"


def test_reason_from_entries_skips_zero_and_keeps_parameters_order():
    """CR2 (FR-021): reason_from_entries keeps only entries scoring > 0, in PARAMETERS order,
    and never carries a vital value (unit test on hand-built synthetic entries)."""
    entries = [
        {"parameter": "temperature", "value": 38.4, "points": 1},
        {"parameter": "respiratory_rate", "value": 25, "points": 3},
        {"parameter": "spo2", "value": 91, "points": 0},   # scored 0 -> skipped
        {"parameter": "heart_rate", "value": 131, "points": 3},
    ]
    reason = reason_from_entries(entries)
    assert reason == [
        {"parameter": "respiratory_rate", "points": 3},
        {"parameter": "heart_rate", "points": 3},
        {"parameter": "temperature", "points": 1},
    ]
    # No "value" key leaks into the structured reason.
    assert all(set(item) == {"parameter", "points"} for item in reason)


def test_ac5_mappings_are_the_documented_values():
    """AC5 (FR-002, FR-003): the band->severity and band->step mappings are exactly as specified."""
    assert BAND_SEVERITY == {"medium": "medium", "high": "high"}
    assert BAND_STEP == {"medium": 1, "high": 2}
    assert suggested_level(3, "medium") == 2
    assert suggested_level(3, "high") == 1
    assert suggested_level(2, "high") == 1   # clamp at Triage I
    assert suggested_level(1, "medium") == 1


def test_ac5_high_crossing_from_triage_three_suggests_level_one(engine):
    """AC5 (FR-003): a high crossing for a Triage III patient suggests level 1 (3 - 2)."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, HIGH_VITALS)
        alert = _open_alerts(session, patient.id)[0]
        assert alert.severity == "high"
        assert read_tag(alert.message) == ("high", 1)


def test_ac5_high_crossing_from_triage_two_clamps_at_one(engine):
    """AC5 (FR-003): a high crossing for a Triage II patient clamps the suggested level at 1."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=2)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, HIGH_VITALS)
        alert = _open_alerts(session, patient.id)[0]
        assert read_tag(alert.message) == ("high", 1)


def test_ac5_patient_already_at_triage_one_gets_no_suggestion(engine):
    """AC5 (FR-003): a patient already at Triage I is never suggested a more urgent level."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=1)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, HIGH_VITALS)
        assert _open_alerts(session, patient.id) == []


# --- AC4: no duplicate open suggestion ------------------------------------------


def test_ac4_later_medium_adds_nothing_later_high_adds_a_second(engine):
    """AC4 (FR-006): with an open medium suggestion a later medium adds nothing; a later high adds a second open suggestion."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, MEDIUM_VITALS)       # open medium
        assert len(_open_alerts(session, patient.id)) == 1

        _save(session, patient, MEDIUM_VITALS)       # same band: no second one
        assert len(_open_alerts(session, patient.id)) == 1

        _save(session, patient, HIGH_VITALS)         # strictly more urgent: a second
        open_alerts = _open_alerts(session, patient.id)
        assert len(open_alerts) == 2
        tags = sorted(read_tag(a.message) for a in open_alerts)
        assert ("high", 1) in tags and ("medium", 2) in tags


def test_ac4_after_dismiss_a_later_medium_may_suggest_again(engine):
    """AC4 (FR-006): once the open suggestion is dismissed, a later medium crossing may suggest again."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        doctor = _add_user(session)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, MEDIUM_VITALS)       # open medium
        alert = _open_alerts(session, patient.id)[0]

        dismiss_suggestion(session, alert, doctor.id)
        session.flush()
        assert _open_alerts(session, patient.id) == []

        _save(session, patient, LOW_VITALS)          # reset the previous band
        _save(session, patient, MEDIUM_VITALS)       # low -> medium: suggests again
        assert len(_open_alerts(session, patient.id)) == 1


# --- AC11: discharged patient ---------------------------------------------------


def test_ac11_discharged_patient_gets_no_new_suggestion(engine):
    """AC11 (FR-001): a crossing for a discharged patient raises no suggestion."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3, status="discharged")
        _save(session, patient, LOW_VITALS)
        _save(session, patient, HIGH_VITALS)
        assert _open_alerts(session, patient.id) == []


# --- AC12: all or nothing -------------------------------------------------------


def test_ac12_forced_alert_failure_and_rollback_leaves_nothing(engine, monkeypatch):
    """AC12 (FR-001): a forced error while adding the alert, then rollback, leaves no reading, score or alert."""
    import app.retriage as retriage

    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)          # a committed previous reading
        session.commit()

    def boom(*args, **kwargs):
        raise RuntimeError("synthetic alert failure")

    # Make building the suggestion message fail inside evaluate_retriage so the
    # whole record_reading transaction is aborted and rolled back.
    monkeypatch.setattr(retriage, "build_message", boom)

    with Session(engine) as session:
        patient = session.scalars(select(Patient)).one()
        with pytest.raises(RuntimeError):
            record_reading(session, patient.id, MEDIUM_VITALS)
        session.rollback()

    with Session(engine) as session:
        # The previous reading stays; the failed crossing reading, its score and
        # any alert are gone.
        assert _count(session, VitalSign) == 1
        assert _count(session, ReadingScore) == 1
        assert _count(session, Alert) == 0


# --- accept_suggestion / dismiss_suggestion unit behaviour ----------------------


def test_accept_suggestion_sets_level_and_writes_one_manual_event(engine):
    """AC6 (FR-008): accept sets the triage level, adds one source='manual' event with score None, acknowledges the alert."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        doctor = _add_user(session)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, HIGH_VITALS)          # open high, suggested level 1
        alert = _open_alerts(session, patient.id)[0]

        accept_suggestion(session, patient, alert, doctor.id)
        session.flush()

        session.refresh(patient)
        assert patient.triage_level == 1
        events = session.scalars(select(TriageEvent)).all()
        assert len(events) == 1
        event = events[0]
        assert event.source == "manual"
        assert event.previous_level == 3
        assert event.new_level == 1
        assert event.created_by_id == doctor.id
        assert event.occurred_at is not None
        assert event.score is None
        assert alert.status == "acknowledged"
        assert alert.acknowledged_by_id == doctor.id
        assert alert.acknowledged_at is not None


def test_dismiss_suggestion_only_acknowledges(engine):
    """AC7 (FR-009): dismiss acknowledges the alert, with no level change and no triage event."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        doctor = _add_user(session)
        _save(session, patient, LOW_VITALS)
        _save(session, patient, MEDIUM_VITALS)
        alert = _open_alerts(session, patient.id)[0]

        dismiss_suggestion(session, alert, doctor.id)
        session.flush()

        session.refresh(patient)
        assert patient.triage_level == 3
        assert _count(session, TriageEvent) == 0
        assert alert.status == "acknowledged"
        assert alert.acknowledged_by_id == doctor.id
        assert alert.acknowledged_at is not None


def test_evaluate_retriage_reads_the_stored_band_not_a_recomputed_one(engine):
    """AC1 (FR-010): evaluate_retriage uses the stored band; changing it drives the decision, proving no recompute."""
    with Session(engine) as session:
        patient = _add_patient(session, triage_level=3)
        _save(session, patient, LOW_VITALS)          # previous low
        # Save a genuinely low reading, then overwrite its stored band to 'high'
        # to show evaluate_retriage trusts the stored band only.
        row = record_reading(session, patient.id, LOW_VITALS)
        score = session.scalars(
            select(ReadingScore).where(ReadingScore.vital_sign_id == row.id)
        ).one()
        # record_reading already evaluated with the low band (no alert).
        assert _open_alerts(session, patient.id) == []
        score.band = "high"
        session.flush()
        evaluate_retriage(session, patient, score)
        session.flush()
        alerts = _open_alerts(session, patient.id)
        assert len(alerts) == 1
        assert alerts[0].severity == "high"
