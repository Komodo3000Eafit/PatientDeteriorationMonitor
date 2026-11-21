"""US-03: reading_scores table and backfill of every existing reading

Hand-written to match ``app/models.py`` (``ReadingScore``) and
``specs/017-vital-signs-scoring/data-model.md`` (research R3). Every constraint
name is the one the models' naming convention produces, passed through
``op.f()``. After creating the table, every existing reading is scored through
the scoring module in batches ordered by id (online mode only; ``--sql`` mode
renders the DDL without a backfill). An invalid stored reading raises
``InvalidVitalSigns`` (parameters and reasons only, no values) and the single
upgrade transaction rolls everything back. The downgrade drops the table: the
scores are derived from the readings and upgrading again rebuilds them.

Revision ID: 0002_reading_scores
Revises: 0001_initial_schema
Create Date: 2026-11-20

"""
from decimal import Decimal
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.readings import score_values
from app.scoring import VitalSigns, get_scoring_system


# revision identifiers, used by Alembic.
revision: str = "0002_reading_scores"
down_revision: Union[str, Sequence[str], None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BATCH_SIZE = 500

# Lightweight table definitions with typed columns, so every driver returns the
# right Python types (SQLite would otherwise return 0/1 for booleans). The
# migration reads and writes only through these, never through the models.
vital_signs_table = sa.table(
    "vital_signs",
    sa.column("id", sa.Integer),
    sa.column("respiratory_rate", sa.SmallInteger),
    sa.column("spo2", sa.SmallInteger),
    sa.column("on_oxygen", sa.Boolean),
    sa.column("systolic_bp", sa.SmallInteger),
    sa.column("heart_rate", sa.SmallInteger),
    sa.column("consciousness", sa.String),
    sa.column("temperature", sa.Numeric(3, 1)),
)

reading_scores_table = sa.table(
    "reading_scores",
    sa.column("vital_sign_id", sa.Integer),
    sa.column("system", sa.String),
    sa.column("total", sa.SmallInteger),
    sa.column("band", sa.String),
    sa.column("entries", sa.JSON),
)


def backfill(connection, batch_size=BATCH_SIZE) -> None:
    """Score every reading and insert its reading_scores row, in keyset batches by id.

    ``InvalidVitalSigns`` propagates unchanged; nothing is logged.
    """
    scoring = get_scoring_system()
    last_id = 0
    while True:
        rows = connection.execute(
            sa.select(vital_signs_table)
            .where(vital_signs_table.c.id > last_id)
            .order_by(vital_signs_table.c.id)
            .limit(batch_size)
        ).all()
        if not rows:
            return
        values = []
        for row in rows:
            vitals = VitalSigns(
                respiratory_rate=row.respiratory_rate,
                spo2=row.spo2,
                on_oxygen=row.on_oxygen,
                systolic_bp=row.systolic_bp,
                heart_rate=row.heart_rate,
                consciousness=row.consciousness,
                temperature=Decimal(str(row.temperature)),
            )
            result = scoring.score(vitals)
            values.append({"vital_sign_id": row.id, **score_values(result)})
        connection.execute(sa.insert(reading_scores_table), values)
        last_id = rows[-1].id


def upgrade() -> None:
    """Create reading_scores, then score every existing reading (online mode only)."""
    op.create_table(
        "reading_scores",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("vital_sign_id", sa.Integer(), nullable=False),
        sa.Column("system", sa.String(length=20), nullable=False),
        sa.Column("total", sa.SmallInteger(), nullable=False),
        sa.Column("band", sa.String(length=20), nullable=False),
        sa.Column("entries", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reading_scores")),
        sa.UniqueConstraint(
            "vital_sign_id", name=op.f("uq_reading_scores_vital_sign_id")
        ),
        sa.ForeignKeyConstraint(
            ["vital_sign_id"],
            ["vital_signs.id"],
            name=op.f("fk_reading_scores_vital_sign_id_vital_signs"),
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint("total >= 0", name=op.f("ck_reading_scores_total")),
        sa.CheckConstraint(
            "band IN ('low', 'low-medium', 'medium', 'high')",
            name=op.f("ck_reading_scores_band"),
        ),
    )
    if not op.get_context().as_sql:
        # BATCH_SIZE is read at call time so a test can change it.
        backfill(op.get_bind(), BATCH_SIZE)


def downgrade() -> None:
    """Drop reading_scores; the scores are derived data rebuilt by upgrading again."""
    op.drop_table("reading_scores")
