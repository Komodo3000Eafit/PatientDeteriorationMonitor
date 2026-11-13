"""Database connection for the backend (TS-02).

The connection string comes only from the ``DATABASE_URL`` environment variable.
Locally it may be loaded from the git-ignored ``backend/.env`` file; a variable that
is already set in the environment always wins over the file.
"""

import logging
import os
import ssl
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

logger = logging.getLogger(__name__)

# libpq query parameters that pg8000 does not accept.
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding"}

_engine = None


def database_url() -> str | None:
    """Return the SQLAlchemy URL built from ``DATABASE_URL``, or ``None`` if not set.

    A leading ``postgresql://`` or ``postgres://`` is replaced with
    ``postgresql+pg8000://`` so SQLAlchemy uses the pure-Python pg8000 driver, and
    the libpq-only ``sslmode`` and ``channel_binding`` query parameters are removed
    because pg8000 rejects them (TLS is set in ``get_engine``). Credentials, host,
    database and any other query parameters are left unchanged. A value with any
    other scheme is returned as is.
    """
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return None
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            parts = urlsplit("postgresql+pg8000://" + url[len(prefix):])
            kept = [
                param
                for param in parts.query.split("&")
                if param and param.split("=", 1)[0] not in _LIBPQ_ONLY_PARAMS
            ]
            return urlunsplit(parts._replace(query="&".join(kept)))
    return url


def get_engine():
    """Return the shared engine, creating it on the first call.

    TLS uses the default SSL context (certificate and host-name checks), and
    pg8000 gets a 5 s socket timeout; waiting for a pooled connection is also
    limited to 5 s.
    """
    global _engine
    if _engine is None:
        _engine = create_engine(
            database_url(),
            connect_args={"ssl_context": ssl.create_default_context(), "timeout": 5},
            pool_pre_ping=True,
            pool_timeout=5,
        )
    return _engine


def reset_engine() -> None:
    """Dispose the cached engine, if any, so the next call creates a new one."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def check_database() -> str:
    """Return ``"ok"`` if a trivial query succeeds, otherwise ``"unavailable"``.

    Failures are logged only by error type; the URL and the error message are
    never logged or returned, because they can contain credentials.
    """
    if database_url() is None:
        return "unavailable"
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SET LOCAL statement_timeout = '5s'"))
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception as exc:
        logger.warning("Database check failed (%s)", type(exc).__name__)
        return "unavailable"
