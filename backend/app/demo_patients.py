"""Create or reset the synthetic demo patients PAT-001 to PAT-006 (TS-08). Run from backend/: python -m app.demo_patients [--reset] [--yes]. Never prints the connection string. See specs/008-vital-signs-simulator/contracts/commands.md §1."""

import argparse
import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import database_url, get_engine
from app.models import Alert, Patient, TriageEvent, VitalSign

# (identifier, name, age, sex, scenario, initial triage level). Synthetic data only.
DEMO_PATIENTS = (
    ("PAT-001", "Paciente Demo Uno", 34, "female", "stable", 4),
    ("PAT-002", "Paciente Demo Dos", 58, "male", "stable", 5),
    ("PAT-003", "Paciente Demo Tres", 67, "female", "slow", 3),
    ("PAT-004", "Paciente Demo Cuatro", 45, "male", "slow", 4),
    ("PAT-005", "Paciente Demo Cinco", 72, "male", "rapid", 3),
    ("PAT-006", "Paciente Demo Seis", 51, "female", "rapid", 4),
)

DEMO_IDENTIFIERS = tuple(row[0] for row in DEMO_PATIENTS)

INITIAL_REASON = "Initial triage level (demo data)"

_CONFIRM_PROMPT = (
    'Type "yes" to delete the readings, triage events and alerts of PAT-001 to PAT-006: '
)


def _initial_event(patient_id: int, level: int) -> TriageEvent:
    """Return the "initial" triage event for a demo patient."""
    return TriageEvent(
        patient_id=patient_id,
        previous_level=None,
        new_level=level,
        score=None,
        reason=INITIAL_REASON,
        source="initial",
        created_by_id=None,
    )


def _create(session, row) -> None:
    """Add the demo patient in ``row`` and its initial triage event."""
    identifier, name, age, sex, _scenario, level = row
    patient = Patient(
        identifier=identifier,
        name=name,
        age=age,
        sex=sex,
        triage_level=level,
        status="active",
    )
    session.add(patient)
    session.flush()
    session.add(_initial_event(patient.id, level))


def _find(session, identifier: str):
    """Return the patient with exactly ``identifier``, or None."""
    return session.scalars(
        select(Patient).where(Patient.identifier == identifier)
    ).first()


def ensure_demo_patients(session) -> list[tuple[str, str]]:
    """Create the missing demo patients; existing ones are left unchanged. Does not commit."""
    results: list[tuple[str, str]] = []
    for row in DEMO_PATIENTS:
        identifier = row[0]
        if _find(session, identifier) is not None:
            results.append(("exists", identifier))
        else:
            _create(session, row)
            results.append(("created", identifier))
    return results


def reset_demo_patients(session) -> list[tuple[str, str]]:
    """Reset exactly PAT-001 to PAT-006 to their initial state. Does not commit.

    Deletes their alerts, triage events and readings (all foreign keys are
    RESTRICT, so the order matters), sets them back to ``active`` at their
    initial level with a new initial event, and creates any that are missing.
    Only the exact identifiers in DEMO_IDENTIFIERS are matched, never a prefix.
    """
    existing = {
        patient.identifier: patient
        for patient in session.scalars(
            select(Patient).where(Patient.identifier.in_(DEMO_IDENTIFIERS))
        )
    }
    ids = [patient.id for patient in existing.values()]
    session.execute(delete(Alert).where(Alert.patient_id.in_(ids)))
    session.execute(delete(TriageEvent).where(TriageEvent.patient_id.in_(ids)))
    session.execute(delete(VitalSign).where(VitalSign.patient_id.in_(ids)))

    results: list[tuple[str, str]] = []
    for row in DEMO_PATIENTS:
        identifier, level = row[0], row[5]
        patient = existing.get(identifier)
        if patient is not None:
            patient.triage_level = level
            patient.status = "active"
            session.add(_initial_event(patient.id, level))
            results.append(("reset", identifier))
        else:
            _create(session, row)
            results.append(("created", identifier))
    return results


def parse_args(argv):
    """Parse the command-line options."""
    parser = argparse.ArgumentParser(
        prog="python -m app.demo_patients",
        description="Create the synthetic demo patients PAT-001 to PAT-006, or reset them with --reset.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete the readings, triage events and alerts of PAT-001 to PAT-006 and restore their initial state",
    )
    parser.add_argument(
        "--yes", action="store_true", help="confirm --reset without a prompt"
    )
    return parser.parse_args(argv)


def _confirmed(input_fn, is_interactive) -> bool:
    """Ask for the reset confirmation; only the exact answer "yes" confirms."""
    if not is_interactive():
        return False
    try:
        answer = input_fn(_CONFIRM_PROMPT)
    except EOFError:
        return False
    return answer.strip() == "yes"


def main(argv=None, input_fn=input, is_interactive=None) -> int:
    """Run the command and return the process exit code."""
    args = parse_args(argv)
    if is_interactive is None:
        is_interactive = lambda: sys.stdin is not None and sys.stdin.isatty()  # noqa: E731
    # The confirmation comes before any database access.
    if args.reset and not args.yes and not _confirmed(input_fn, is_interactive):
        print("Reset cancelled: nothing was changed", file=sys.stderr)
        return 1
    if database_url() is None:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    try:
        with Session(get_engine()) as session:
            if args.reset:
                results = reset_demo_patients(session)
            else:
                results = ensure_demo_patients(session)
            session.commit()
    # Broad on purpose (like db.check_database): a malformed DATABASE_URL or a
    # driver/SSL error must not escape as a traceback that could echo the URL.
    except Exception as exc:
        print(
            f"Could not update the demo patients ({type(exc).__name__})",
            file=sys.stderr,
        )
        return 1
    rows = {row[0]: row for row in DEMO_PATIENTS}
    for action, identifier in results:
        if action == "exists":
            print(f"{action}: {identifier}")
        else:
            scenario, level = rows[identifier][4], rows[identifier][5]
            print(f"{action}: {identifier} ({scenario}, triage {level})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
