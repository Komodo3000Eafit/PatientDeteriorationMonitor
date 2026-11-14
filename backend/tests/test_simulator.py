"""Tests for the vital-signs simulator (TS-08).

Covers FR-003 to FR-012, AC2 to AC9, SC-002 and SC-003 of
specs/008-vital-signs-simulator/spec.md, contracts/commands.md §2 and
data-model.md: scenario generation (valid types and limits, reproducible,
gradual, plateau, trend checked with the scoring module), one reading per active
patient per round through record_reading, continuation from saved readings, the
stop conditions (rounds, time, Ctrl+C), the options and the error output. Uses an
in-memory SQLite database, a fake sleep and a fake clock, and synthetic data
only; no real database, no network and no real waiting.
"""

import dataclasses
import sqlite3
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import app.readings
import app.simulator as simulator
from app.demo_patients import DEMO_PATIENTS, ensure_demo_patients
from app.models import Base, Patient, VitalSign
from app.scoring import ACCEPTED_LIMITS, PARAMETERS, get_scoring_system, validate_vital_signs

INTEGERS = ("respiratory_rate", "spo2", "systolic_bp", "heart_rate")
SEEDS = range(1, 6)
N_DEMO = len(DEMO_PATIENTS)


@pytest.fixture
def engine():
    """An in-memory SQLite engine with all the tables."""
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def demo_engine(engine):
    """The engine with the six demo patients."""
    with Session(engine) as session:
        ensure_demo_patients(session)
        session.commit()
    return engine


@pytest.fixture
def use_engine(demo_engine, monkeypatch):
    """Point the simulator command at the SQLite engine with the demo patients."""
    monkeypatch.setattr(simulator, "database_url", lambda: "sqlite://")
    monkeypatch.setattr(simulator, "get_engine", lambda: demo_engine)
    return demo_engine


class FakeTime:
    """fake_sleep records the intervals; the clock advances by each slept interval."""

    def __init__(self):
        self.now = 0
        self.slept = []

    def clock(self):
        return self.now

    def fake_sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def _new_stats():
    return {"rounds": 0, "saved": 0}


def _count(session, patient_id=None) -> int:
    query = select(func.count()).select_from(VitalSign)
    if patient_id is not None:
        query = query.where(VitalSign.patient_id == patient_id)
    return session.scalar(query)


def _patient_id(session, identifier) -> int:
    return session.scalar(select(Patient.id).where(Patient.identifier == identifier))


def _numeric(vitals):
    return {name: getattr(vitals, name) for name in (*INTEGERS, "temperature")}


# --- Scenario generation -------------------------------------------------------


def test_values_within_limits_and_types():
    """AC6, SC-003, FR-006: every generated value has the right type, is within ACCEPTED_LIMITS and passes validation."""
    for scenario in simulator.SCENARIOS:
        for seed in SEEDS:
            for step in range(0, 51):
                v = simulator.generate_vitals(scenario, seed, "PAT-001", step)
                for name in INTEGERS:
                    value = getattr(v, name)
                    assert type(value) is int, (scenario, seed, step, name)
                    assert ACCEPTED_LIMITS[name].minimum <= value <= ACCEPTED_LIMITS[name].maximum
                assert type(v.on_oxygen) is bool
                assert v.consciousness in ("A", "C")
                assert type(v.temperature) is Decimal
                assert v.temperature.as_tuple().exponent == -1
                limit = ACCEPTED_LIMITS["temperature"]
                assert limit.minimum <= v.temperature <= limit.maximum
                validate_vital_signs(v)


def test_reproducible():
    """AC5, FR-005: the same (scenario, seed, identifier, step) gives the same reading; different seeds differ."""
    for scenario in simulator.SCENARIOS:
        for step in range(0, 11):
            first = simulator.generate_vitals(scenario, 42, "PAT-003", step)
            second = simulator.generate_vitals(scenario, 42, "PAT-003", step)
            assert first == second
        assert any(
            simulator.generate_vitals(scenario, 1, "PAT-003", step)
            != simulator.generate_vitals(scenario, 2, "PAT-003", step)
            for step in range(0, 11)
        ), scenario


def test_plateau_after_end():
    """FR-004, data-model: after `steps` readings the slow and rapid values stay at final +/- noise, on oxygen, with the final ACVPU."""
    for scenario in ("slow", "rapid"):
        spec = simulator.SCENARIOS[scenario]
        steps = spec["steps"]
        expected_c = "C" if spec["c_at"] is not None else "A"
        for seed in SEEDS:
            for step in range(steps, steps + 31):
                v = simulator.generate_vitals(scenario, seed, "PAT-005", step)
                for name, (_start, final, noise) in spec["params"].items():
                    value = getattr(v, name)
                    if name == "temperature":
                        assert abs(value - Decimal(str(final))) <= Decimal("0.1"), (scenario, step, name)
                    else:
                        assert abs(value - final) <= noise, (scenario, step, name)
                assert v.on_oxygen is True
                assert v.consciousness == expected_c


def test_gradual():
    """AC4, FR-004: consecutive steps never jump more than the per-step trend plus noise."""
    for scenario, spec in simulator.SCENARIOS.items():
        steps = spec["steps"]
        for seed in SEEDS:
            previous = None
            for step in range(0, steps + 10):
                current = _numeric(simulator.generate_vitals(scenario, seed, "PAT-004", step))
                if previous is not None:
                    for name, (start, final, noise) in spec["params"].items():
                        diff = abs(current[name] - previous[name])
                        if name == "temperature":
                            trend = abs(Decimal(str(final)) - Decimal(str(start))) / steps
                            limit = trend + 2 * Decimal(str(noise)) + Decimal("0.1")
                        else:
                            limit = abs(final - start) / steps + 2 * noise + 1
                        assert diff <= limit, (scenario, seed, step, name, diff, limit)
                previous = current


def test_trend_with_scoring():
    """AC4, SC-002: stable stays low risk; slow and rapid get worse and reach high risk; rapid is high by step 3."""
    scoring = get_scoring_system()

    def score(scenario, seed, step):
        return scoring.score(simulator.generate_vitals(scenario, seed, "PAT-006", step))

    for seed in SEEDS:
        for step in range(0, 21):
            assert score("stable", seed, step).band == "low", (seed, step)
        for scenario in ("slow", "rapid"):
            steps = simulator.SCENARIOS[scenario]["steps"]
            end = score(scenario, seed, steps)
            assert end.total > score(scenario, seed, 0).total, (scenario, seed)
            assert end.band == "high", (scenario, seed)
        assert score("rapid", seed, 3).band == "high", seed


def test_scenario_for():
    """FR-003: demo identifiers map to their scenario; any other patient is stable."""
    assert simulator.scenario_for("PAT-005") == "rapid"
    assert simulator.scenario_for("PAT-003") == "slow"
    assert simulator.scenario_for("PAT-001") == "stable"
    assert simulator.scenario_for("PAT-100") == "stable"


# --- Rounds --------------------------------------------------------------------


def test_round_active_only(demo_engine):
    """AC2, AC9, FR-003, FR-009: one reading per active patient, none for discharged; lines show identifier, scenario and step, never the name."""
    with Session(demo_engine) as session:
        session.add(Patient(
            identifier="DIS-001", name="Synthetic Discharged Patient", age=50, sex="other",
            triage_level=5, status="discharged",
        ))
        session.commit()
        lines = []
        stats = _new_stats()

        saved = simulator.run_round(session, 1, lines.append, stats)

        assert saved == N_DEMO
        assert stats["saved"] == N_DEMO
        assert _count(session) == N_DEMO
        assert _count(session, _patient_id(session, "DIS-001")) == 0
        for identifier, *_ in DEMO_PATIENTS:
            assert _count(session, _patient_id(session, identifier)) == 1
    assert len(lines) == N_DEMO
    for line, (identifier, name, _age, _sex, scenario, _level) in zip(lines, DEMO_PATIENTS):
        assert line.startswith(f"  {identifier} {scenario} step 0: ")
        assert "RR " in line and "SpO2 " in line and "T " in line
        assert name not in line
    assert all("DIS-001" not in line and "Synthetic" not in line for line in lines)


def test_step_continues(demo_engine):
    """AC5, FR-005: the step is the number of saved readings, so a new round continues the scenario."""
    seed = 9
    with Session(demo_engine) as session:
        pat5 = _patient_id(session, "PAT-005")
        for step in range(3):
            app.readings.record_reading(session, pat5, simulator.generate_vitals("rapid", 0, "PAT-005", step))
        session.commit()

        lines = []
        stats = _new_stats()
        assert simulator.run_round(session, seed, lines.append, stats) == N_DEMO
        assert stats["saved"] == N_DEMO
        assert any(line.startswith("  PAT-005 rapid step 3: ") for line in lines)
        assert any(line.startswith("  PAT-001 stable step 0: ") for line in lines)

        latest = session.scalars(
            select(VitalSign).where(VitalSign.patient_id == pat5).order_by(VitalSign.id.desc())
        ).first()
        expected = simulator.generate_vitals("rapid", seed, "PAT-005", 3)
        for name in PARAMETERS:
            assert getattr(latest, name) == getattr(expected, name), name

        lines = []
        assert simulator.run_round(session, seed, lines.append, stats) == N_DEMO
        assert stats["saved"] == 2 * N_DEMO
        assert any(line.startswith("  PAT-001 stable step 1: ") for line in lines)
        assert any(line.startswith("  PAT-005 rapid step 4: ") for line in lines)


def test_no_active_patients(engine):
    """AC2: with no active patients a round prints a note and saves nothing."""
    with Session(engine) as session:
        lines = []
        stats = _new_stats()
        assert simulator.run_round(session, 1, lines.append, stats) == 0
        assert stats["saved"] == 0
        assert _count(session) == 0
    assert lines == ["  no active patients"]


def test_invalid_generated_reading_skipped(demo_engine, monkeypatch):
    """AC6, AC7, FR-007: an invalid reading is reported by parameter name, not saved, and the round goes on."""
    real = simulator.generate_vitals

    def bad_for_pat2(scenario, seed, identifier, step):
        vitals = real(scenario, seed, identifier, step)
        return dataclasses.replace(vitals, spo2=101) if identifier == "PAT-002" else vitals

    monkeypatch.setattr(simulator, "generate_vitals", bad_for_pat2)
    with Session(demo_engine) as session:
        lines = []
        stats = _new_stats()

        assert simulator.run_round(session, 1, lines.append, stats) == N_DEMO - 1

        assert stats["saved"] == N_DEMO - 1
        assert _count(session, _patient_id(session, "PAT-002")) == 0
        assert _count(session) == N_DEMO - 1
    assert "  PAT-002 not saved: invalid spo2" in lines
    assert not any(line.startswith("  PAT-002 stable step") for line in lines)


# --- Run loop and stop conditions ----------------------------------------------


def _run(engine, interval, max_rounds, max_seconds, fake, sleep=None, stats=None):
    lines = []
    result = simulator.run(
        interval, max_rounds, max_seconds, 1,
        session_factory=lambda: Session(engine),
        sleep=sleep or fake.fake_sleep, clock=fake.clock, out=lines.append, stats=stats,
    )
    return result, lines


@pytest.mark.parametrize(
    ("interval", "max_rounds", "max_seconds", "rounds", "reason"),
    [
        (300, 1, 3600, 1, "round limit reached"),
        (300, 3, 3600, 3, "round limit reached"),
        (300, None, 3600, 12, "time limit reached"),
        (15, None, 60, 4, "time limit reached"),
    ],
    ids=["once", "three-rounds", "60-minutes", "demo-60-seconds"],
)
def test_stop_conditions(demo_engine, interval, max_rounds, max_seconds, rounds, reason):
    """AC8, AC3, FR-010, FR-011: the run stops by itself at the round or time limit, sleeping the interval between rounds."""
    fake = FakeTime()

    result, lines = _run(demo_engine, interval, max_rounds, max_seconds, fake)

    assert result == (rounds, rounds * N_DEMO, reason)
    assert fake.slept == [interval] * (rounds - 1)
    assert [line for line in lines if line.startswith("Round ")] == [f"Round {n}" for n in range(1, rounds + 1)]
    with Session(demo_engine) as session:
        assert _count(session) == rounds * N_DEMO


def test_ctrl_c(demo_engine, monkeypatch):
    """AC8, FR-011 (analyze F1, U1): Ctrl+C stops cleanly with correct totals and keeps only committed readings; a database error propagates with the totals in stats."""
    # Ctrl+C during the second sleep, after round 2.
    fake = FakeTime()

    def sleep_then_interrupt(seconds):
        fake.fake_sleep(seconds)
        if len(fake.slept) == 2:
            raise KeyboardInterrupt

    result, _ = _run(demo_engine, 15, None, 3600, fake, sleep=sleep_then_interrupt)
    assert result == (2, 2 * N_DEMO, "stopped by Ctrl+C")
    with Session(demo_engine) as session:
        assert _count(session) == 2 * N_DEMO
        session.execute(VitalSign.__table__.delete())
        session.commit()

    real_record = app.readings.record_reading

    def failing_on_third(error):
        calls = []

        def wrapper(session, patient_id, vitals):
            row = real_record(session, patient_id, vitals)
            calls.append(patient_id)
            if len(calls) == 3:
                raise error
            return row

        return wrapper

    # Ctrl+C while the third patient of round 1 is being saved.
    monkeypatch.setattr(simulator, "record_reading", failing_on_third(KeyboardInterrupt()))
    result, _ = _run(demo_engine, 15, None, 3600, FakeTime())
    assert result == (1, 2, "stopped by Ctrl+C")
    with Session(demo_engine) as session:
        assert _count(session) == 2
        assert _count(session, _patient_id(session, "PAT-003")) == 0
        session.execute(VitalSign.__table__.delete())
        session.commit()

    # A database error the same way propagates; stats holds the committed totals.
    monkeypatch.setattr(simulator, "record_reading", failing_on_third(SQLAlchemyError("synthetic error")))
    stats = _new_stats()
    with pytest.raises(SQLAlchemyError):
        _run(demo_engine, 15, None, 3600, FakeTime(), stats=stats)
    assert stats == {"rounds": 1, "saved": 2}
    with Session(demo_engine) as session:
        assert _count(session) == 2


# --- Command line ----------------------------------------------------------------


def test_options(capsys):
    """AC3, FR-010, FR-011: defaults, --demo, --interval-seconds and --once; invalid combinations and values exit with code 2."""
    args = simulator.parse_args([])
    assert (args.interval, args.minutes, args.rounds) == (300, 60, None)
    assert simulator.parse_args(["--demo"]).interval == 15
    assert simulator.parse_args(["--interval-seconds", "20"]).interval == 20
    assert simulator.parse_args(["--once"]).rounds == 1
    assert simulator.parse_args(["--rounds", "5"]).rounds == 5
    assert simulator.parse_args(["--seed", "7"]).seed == 7

    for argv in (
        ["--demo", "--interval-seconds", "20"],
        ["--once", "--rounds", "2"],
        ["--rounds", "0"],
        ["--minutes", "-1"],
        ["--interval-seconds", "abc"],
    ):
        with pytest.raises(SystemExit) as info:
            simulator.parse_args(argv)
        assert info.value.code == 2, argv
    capsys.readouterr()


def test_main_errors(monkeypatch, capsys):
    """AC9, FR-012: no DATABASE_URL or an unreachable database returns 1 with a clear error and no connection details."""

    def no_engine():
        raise AssertionError("the database must not be touched")

    monkeypatch.setattr(simulator, "get_engine", no_engine)
    code = simulator.main(["--once"])
    out, err = capsys.readouterr()
    assert code == 1
    assert "DATABASE_URL is not set" in err
    assert out == ""

    def refuse_connection():
        raise sqlite3.OperationalError("synthetic failure at no/such/dir")

    failing = create_engine("sqlite://", creator=refuse_connection)
    monkeypatch.setattr(simulator, "database_url", lambda: "sqlite://")
    monkeypatch.setattr(simulator, "get_engine", lambda: failing)

    code = simulator.main(["--once", "--seed", "1"])

    out, err = capsys.readouterr()
    failing.dispose()
    assert code == 1
    assert "Could not reach the database (" in err
    assert "Stopped: database error. Rounds: 1, readings saved: 0." in out
    for text in (out, err):
        assert "no/such/dir" not in text
        assert "sqlite://" not in text


def test_main_errors_non_database_exception(monkeypatch, capsys):
    """AC9, FR-012 (T010 finding 2): a non-SQLAlchemy error (e.g. a malformed DATABASE_URL) returns 1 without echoing the URL."""

    def bad_engine():
        raise ValueError(
            "invalid port in postgresql://synthetic-user:synthetic-pass@no/such/dir"
        )

    monkeypatch.setattr(simulator, "database_url", lambda: "postgresql://synthetic")
    monkeypatch.setattr(simulator, "get_engine", bad_engine)

    code = simulator.main(["--once", "--seed", "1"])

    out, err = capsys.readouterr()
    assert code == 1
    assert "Stopped: database error. Rounds: 1, readings saved: 0." in out.splitlines()
    assert "Could not reach the database (ValueError)" in err
    for text in (out, err):
        assert "synthetic-pass" not in text
        assert "no/such/dir" not in text
        assert "postgresql://" not in text


def test_main_once_output(use_engine, capsys):
    """AC8, AC9, FR-009: --once --seed 7 prints the header with the seed, one line per patient and a final summary."""
    code = simulator.main(["--once", "--seed", "7"])

    out, err = capsys.readouterr()
    assert code == 0
    assert err == ""
    lines = out.splitlines()
    assert lines[0].startswith("Simulator: interval 300 s, limit 60 min, rounds 1, ")
    assert "seed 7" in lines[0]
    assert lines[1] == "Round 1"
    patient_lines = [line for line in lines if line.startswith("  PAT-")]
    assert len(patient_lines) == N_DEMO
    assert lines[-1] == "Stopped: round limit reached. Rounds: 1, readings saved: 6."
    for row in DEMO_PATIENTS:
        assert row[1] not in out
    with Session(use_engine) as session:
        assert _count(session) == N_DEMO
