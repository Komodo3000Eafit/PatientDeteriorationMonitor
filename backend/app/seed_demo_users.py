"""Create or update the demo accounts (TS-06). Run from backend/: python -m app.seed_demo_users. Passwords come only from DEMO_DOCTOR_PASSWORD / DEMO_NURSE_PASSWORD (environment or backend/.env).

The command never prints passwords, hashes or the connection string. See
specs/006-authentication/contracts/auth-api.md "Demo-user command".
"""

import os
import sys

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import database_url, get_engine
from app.models import User
from app.passwords import hash_password

# (username, full name, role, environment variable with the password)
DEMO_USERS = [
    ("demo.doctor", "Dra. Ana Demo", "doctor", "DEMO_DOCTOR_PASSWORD"),
    ("demo.nurse", "Enf. Luis Demo", "nurse", "DEMO_NURSE_PASSWORD"),
]


def read_demo_passwords(environ) -> tuple[dict[str, str], list[str]]:
    """Return the passwords by username and the list of setting errors.

    Error messages name the setting only, never its value.
    """
    passwords: dict[str, str] = {}
    errors: list[str] = []
    for username, _full_name, _role, var in DEMO_USERS:
        value = (environ.get(var) or "").strip()
        if len(value) < 8:
            errors.append(f"{var} must be set to at least 8 characters")
        else:
            passwords[username] = value
    return passwords, errors


def upsert_demo_users(session, passwords) -> list[tuple[str, str]]:
    """Create or update each demo account in ``session``; does not commit or delete."""
    results: list[tuple[str, str]] = []
    for username, full_name, role, _var in DEMO_USERS:
        password_hash = hash_password(passwords[username])
        existing = session.scalars(
            select(User).where(User.username == username)
        ).first()
        if existing is None:
            session.add(
                User(
                    username=username,
                    password_hash=password_hash,
                    full_name=full_name,
                    role=role,
                )
            )
            results.append(("created", username))
        else:
            existing.password_hash = password_hash
            existing.full_name = full_name
            existing.role = role
            results.append(("updated", username))
    return results


def main(environ=os.environ) -> int:
    """Run the command and return the process exit code."""
    passwords, errors = read_demo_passwords(environ)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    if database_url() is None:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    try:
        with Session(get_engine()) as session:
            results = upsert_demo_users(session, passwords)
            session.commit()
    except SQLAlchemyError as exc:
        print(
            f"Could not update the demo users ({type(exc).__name__})",
            file=sys.stderr,
        )
        return 1
    for action, username in results:
        print(f"{action}: {username}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
