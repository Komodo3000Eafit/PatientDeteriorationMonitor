"""Password hashing (TS-06): PBKDF2-HMAC-SHA256 from the standard library; see specs/006-authentication/research.md R1.

A stored hash has the form ``pbkdf2_sha256$<iterations>$<base64 salt>$<base64 hash>``.
"""

import base64
import binascii
import hashlib
import hmac
import secrets

SCHEME = "pbkdf2_sha256"
DEFAULT_ITERATIONS = 600_000

_MAX_ITERATIONS = 10_000_000


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str, *, iterations: int = DEFAULT_ITERATIONS) -> str:
    """Return a salted PBKDF2-HMAC-SHA256 hash of ``password`` in the stored format."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{SCHEME}${iterations}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    """Return ``True`` if ``password`` matches ``stored``.

    A malformed or unknown stored value gives ``False`` and never raises. The
    final comparison is constant-time.
    """
    if not isinstance(stored, str):
        return False
    parts = stored.split("$")
    if len(parts) != 4 or parts[0] != SCHEME:
        return False
    try:
        iterations = int(parts[1])
    except ValueError:
        return False
    if not 1 <= iterations <= _MAX_ITERATIONS:
        return False
    try:
        salt = base64.b64decode(parts[2], validate=True)
        expected = base64.b64decode(parts[3], validate=True)
    except (ValueError, binascii.Error):
        return False
    computed = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(computed, expected)
