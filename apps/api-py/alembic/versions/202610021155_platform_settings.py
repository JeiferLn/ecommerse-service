"""platform settings

Revision ID: 38baae66b701
Revises: 20261002000000
Create Date: 2026-10-02 11:55:33.365992
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "38baae66b701"
down_revision: str | None = "20261002000000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "PlatformSettings",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("sharedWhatsAppNumber", sa.Text(), nullable=True),
        sa.Column("whatsappSimulateSend", sa.Boolean(), nullable=True),
        sa.Column("updatedAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("PlatformSettings_pkey")),
    )


def downgrade() -> None:
    op.drop_table("PlatformSettings")
