"""Alembic environment for the backend (TS-03).

The connection comes only from ``DATABASE_URL`` through ``app.db`` (TS-02), so
migrations use the same URL conversion, TLS context and timeouts as the app
(research R4). Offline mode (``--sql``) renders PostgreSQL SQL without reading
``DATABASE_URL`` or connecting. Connection failures show only the error type,
never the URL or the driver message. The whole run uses one transaction
(research R3).
"""

from logging.config import fileConfig

from alembic import context

import app.db
from app.models import Base

config = context.config

# Keep existing loggers (for example app.db's) enabled.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Render the migration SQL for PostgreSQL without a database."""
    context.configure(
        dialect_name="postgresql",
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run the migrations on the database in ``DATABASE_URL``."""
    if app.db.database_url() is None:
        raise SystemExit("DATABASE_URL is not set")
    try:
        connection = app.db.get_engine().connect()
    except Exception as exc:
        # The driver message can contain the host or user, so only the type is shown.
        raise SystemExit(
            f"Could not connect to the database ({type(exc).__name__})"
        ) from None
    with connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
