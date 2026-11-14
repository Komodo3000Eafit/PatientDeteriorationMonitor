"""Synthetic vital-signs simulator (TS-08). Run by hand from backend/: python -m app.simulator [--demo|--interval-seconds N] [--once|--rounds N] [--minutes M] [--seed S]. Never started by the API; always stops by itself (constitution cost control). Contains no scoring rules. See specs/008-vital-signs-simulator/contracts/commands.md §2."""

import argparse
import random
import sys
import time
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import database_url, get_engine
from app.demo_patients import DEMO_PATIENTS
from app.models import Patient, VitalSign
from app.readings import record_reading
from app.scoring import ACCEPTED_LIMITS, InvalidVitalSigns, VitalSigns

# Each numeric parameter goes linearly from start to final over `steps` readings,
# plus uniform noise in [-noise, +noise]; progress is capped at 1 (a plateau).
# oxygen_at / c_at: progress from which the patient is on oxygen / confused (None = never).
SCENARIOS = {
    "stable": {
        "steps": 1,
        "params": {
            "respiratory_rate": (16, 16, 1),
            "spo2": (97, 97, 1),
            "systolic_bp": (125, 125, 3),
            "heart_rate": (76, 76, 3),
            "temperature": (36.8, 36.8, 0.1),
        },
        "oxygen_at": None,
        "c_at": None,
    },
    "slow": {
        "steps": 12,
        "params": {
            "respiratory_rate": (16, 24, 1),
            "spo2": (97, 92, 1),
            "systolic_bp": (125, 102, 3),
            "heart_rate": (78, 112, 3),
            "temperature": (36.9, 38.4, 0.1),
        },
        "oxygen_at": 0.75,
        "c_at": None,
    },
    "rapid": {
        "steps": 4,
        "params": {
            "respiratory_rate": (17, 30, 1),
            "spo2": (96, 88, 1),
            "systolic_bp": (122, 88, 3),
            "heart_rate": (80, 135, 3),
            "temperature": (37.0, 39.4, 0.1),
        },
        "oxygen_at": 0.6,
        "c_at": 0.9,
    },
}

DEFAULT_INTERVAL = 300
DEMO_INTERVAL = 15
DEFAULT_MINUTES = 60

_SCENARIO_BY_IDENTIFIER = {row[0]: row[4] for row in DEMO_PATIENTS}


def scenario_for(identifier: str) -> str:
    """Return the demo scenario for ``identifier``; any other patient is "stable"."""
    return _SCENARIO_BY_IDENTIFIER.get(identifier, "stable")


def generate_vitals(scenario: str, seed: int, identifier: str, step: int) -> VitalSigns:
    """Return the reading for one patient at one step. Pure: same inputs, same output."""
    spec = SCENARIOS[scenario]
    # A string seed is stable across processes, unlike hash().
    rng = random.Random(f"{seed}:{identifier}:{step}")
    progress = min(step / spec["steps"], 1)
    values = {}
    for name, (start, final, noise) in spec["params"].items():
        x = start + (final - start) * progress
        if name == "temperature":
            value = Decimal(str(round(x, 1))) + Decimal(rng.randint(-1, 1)) / 10
        else:
            value = round(x) + rng.randint(-noise, noise)
        limit = ACCEPTED_LIMITS[name]
        value = min(max(value, limit.minimum), limit.maximum)
        if name == "temperature":
            value = Decimal(value).quantize(Decimal("0.1"))
        else:
            value = int(value)
        values[name] = value
    on_oxygen = spec["oxygen_at"] is not None and progress >= spec["oxygen_at"]
    consciousness = "C" if spec["c_at"] is not None and progress >= spec["c_at"] else "A"
    return VitalSigns(
        respiratory_rate=values["respiratory_rate"],
        spo2=values["spo2"],
        on_oxygen=on_oxygen,
        systolic_bp=values["systolic_bp"],
        heart_rate=values["heart_rate"],
        consciousness=consciousness,
        temperature=values["temperature"],
    )


def _summary(v: VitalSigns) -> str:
    """Return the one-line text of a reading."""
    return (
        f"RR {v.respiratory_rate}, SpO2 {v.spo2}, O2 {'yes' if v.on_oxygen else 'no'}, "
        f"SBP {v.systolic_bp}, HR {v.heart_rate}, ACVPU {v.consciousness}, T {v.temperature}"
    )


def run_round(session, seed: int, out, stats: dict) -> int:
    """Save one reading for every active patient; return how many were saved.

    Each reading is committed on its own, and ``stats["saved"]`` is incremented
    right after each commit. Patient names are never printed.
    """
    patients = session.execute(
        select(Patient.id, Patient.identifier)
        .where(Patient.status == "active")
        .order_by(Patient.identifier)
    ).all()
    counts = dict(
        session.execute(
            select(VitalSign.patient_id, func.count()).group_by(VitalSign.patient_id)
        ).all()
    )
    if not patients:
        out("  no active patients")
        return 0
    saved = 0
    for patient_id, identifier in patients:
        step = counts.get(patient_id, 0)
        scenario = scenario_for(identifier)
        vitals = generate_vitals(scenario, seed, identifier, step)
        try:
            record_reading(session, patient_id, vitals)
            session.commit()
            stats["saved"] += 1
            saved += 1
        except InvalidVitalSigns as exc:
            session.rollback()
            out(
                f"  {identifier} not saved: invalid "
                f"{', '.join(p.parameter for p in exc.problems)}"
            )
            continue
        out(f"  {identifier} {scenario} step {step}: {_summary(vitals)}")
    return saved


def run(
    interval,
    max_rounds,
    max_seconds,
    seed,
    session_factory,
    sleep=time.sleep,
    clock=time.monotonic,
    out=print,
    stats=None,
) -> tuple[int, int, str]:
    """Run rounds until a limit is reached or Ctrl+C; return (rounds, saved, reason).

    ``stats`` is the only counter, so the totals stay right when a round is
    interrupted. Database and other errors are not caught here; they propagate
    to the caller, and ``stats`` already holds the committed totals.
    """
    if stats is None:
        stats = {"rounds": 0, "saved": 0}
    start = clock()
    try:
        while True:
            stats["rounds"] += 1
            out(f"Round {stats['rounds']}")
            with session_factory() as session:
                run_round(session, seed, out, stats)
            if max_rounds is not None and stats["rounds"] >= max_rounds:
                reason = "round limit reached"
                break
            if clock() - start + interval >= max_seconds:
                reason = "time limit reached"
                break
            sleep(interval)
    except KeyboardInterrupt:
        # Closing the session discards the uncommitted reading, if any.
        reason = "stopped by Ctrl+C"
    return stats["rounds"], stats["saved"], reason


def positive_int(text: str) -> int:
    """argparse type for a whole number greater than 0."""
    try:
        value = int(text)
    except ValueError:
        raise argparse.ArgumentTypeError("must be a positive whole number") from None
    if value <= 0:
        raise argparse.ArgumentTypeError("must be a positive whole number")
    return value


def parse_args(argv):
    """Parse the options; also sets ``interval`` (seconds) and resolves ``rounds`` for --once."""
    parser = argparse.ArgumentParser(
        prog="python -m app.simulator",
        description="Save synthetic vital-sign readings for the active patients, round by round, until a limit is reached.",
    )
    schedule = parser.add_mutually_exclusive_group()
    schedule.add_argument(
        "--interval-seconds",
        type=positive_int,
        help=f"seconds between rounds (default {DEFAULT_INTERVAL})",
    )
    schedule.add_argument(
        "--demo",
        action="store_true",
        help=f"use {DEMO_INTERVAL} seconds between rounds",
    )
    limit = parser.add_mutually_exclusive_group()
    limit.add_argument("--once", action="store_true", help="run one round and exit")
    limit.add_argument("--rounds", type=positive_int, help="stop after N rounds")
    parser.add_argument(
        "--minutes",
        type=positive_int,
        default=DEFAULT_MINUTES,
        help=f"time limit in minutes (default {DEFAULT_MINUTES})",
    )
    parser.add_argument(
        "--seed", type=int, help="whole number; the same seed gives the same values"
    )
    args = parser.parse_args(argv)
    if args.demo:
        args.interval = DEMO_INTERVAL
    elif args.interval_seconds is not None:
        args.interval = args.interval_seconds
    else:
        args.interval = DEFAULT_INTERVAL
    if args.once:
        args.rounds = 1
    return args


def main(argv=None) -> int:
    """Run the command and return the process exit code."""
    args = parse_args(argv)
    if database_url() is None:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    seed = args.seed if args.seed is not None else random.SystemRandom().randrange(1_000_000)
    rounds_text = args.rounds if args.rounds is not None else "no limit"
    print(
        f"Simulator: interval {args.interval} s, limit {args.minutes} min, "
        f"rounds {rounds_text}, seed {seed} (use --seed {seed} to repeat)"
    )
    stats = {"rounds": 0, "saved": 0}
    try:
        rounds, saved, reason = run(
            args.interval,
            args.rounds,
            args.minutes * 60,
            seed,
            session_factory=lambda: Session(get_engine()),
            stats=stats,
        )
    # Broad on purpose (like db.check_database): a malformed DATABASE_URL or a
    # driver/SSL error must not escape as a traceback that could echo the URL.
    # KeyboardInterrupt is not an Exception; run() handles it.
    except Exception as exc:
        print(
            f"Stopped: database error. Rounds: {stats['rounds']}, "
            f"readings saved: {stats['saved']}."
        )
        print(f"Could not reach the database ({type(exc).__name__})", file=sys.stderr)
        return 1
    print(f"Stopped: {reason}. Rounds: {rounds}, readings saved: {saved}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
