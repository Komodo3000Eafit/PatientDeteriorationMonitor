"""Tests for password hashing (TS-06 FR-001, research R1).

PBKDF2-HMAC-SHA256 from the standard library, stored as
``pbkdf2_sha256$<iterations>$<base64 salt>$<base64 hash>``. Synthetic passwords only.
"""

import base64

import pytest

from app.passwords import hash_password, verify_password


def test_hash_format():
    """FR-001: the stored hash has 4 parts, the scheme, 600000 iterations, a 16-byte salt and a 32-byte hash, and fits in 255 characters."""
    stored = hash_password("correct horse")

    parts = stored.split("$")
    assert len(parts) == 4
    assert parts[0] == "pbkdf2_sha256"
    assert parts[1] == "600000"
    assert len(base64.b64decode(parts[2], validate=True)) == 16
    assert len(base64.b64decode(parts[3], validate=True)) == 32
    assert len(stored) <= 255


def test_verify_correct_and_wrong():
    """FR-001: the right password verifies; a wrong or empty password does not."""
    stored = hash_password("correct horse", iterations=1000)

    assert verify_password("correct horse", stored) is True
    assert verify_password("wrong horse", stored) is False
    assert verify_password("", stored) is False


def test_unique_salts():
    """FR-001: each hash uses a new random salt, so two hashes of the same password differ."""
    assert hash_password("same password", iterations=1000) != hash_password(
        "same password", iterations=1000
    )


def test_plain_password_not_in_hash():
    """FR-001: the plain password never appears in the stored value."""
    password = "visible-password-123"

    assert password not in hash_password(password, iterations=1000)


def test_verify_uses_stored_iterations():
    """FR-001, R1: verification uses the iteration count stored in the hash, not the default."""
    stored = hash_password("pw-1000", iterations=1000)

    assert stored.split("$")[1] == "1000"
    assert verify_password("pw-1000", stored) is True


@pytest.mark.parametrize(
    "value",
    [
        "",
        "plain",
        "md5$1$a$b",
        "pbkdf2_sha256$x$a$b",
        "pbkdf2_sha256$0$AA==$AA==",
        "pbkdf2_sha256$1000$!!$AA==",
        "pbkdf2_sha256$1000$AA==",
    ],
)
def test_malformed_hash_is_false(value):
    """FR-001: a malformed or unknown stored value gives False and never raises."""
    assert verify_password("pw", value) is False
