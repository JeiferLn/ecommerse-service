"""add ai usage table for rate limiting

Revision ID: b2d9f5e3c740
Revises: a1c8e4f2b639
Create Date: 2026-10-07 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b2d9f5e3c740"
down_revision: str | None = "a1c8e4f2b639"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "AiUsage",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("companyId", sa.Text(), nullable=False),
        sa.Column("conversationId", sa.Text(), nullable=True),
        sa.Column("customerPhone", sa.Text(), nullable=True),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.ForeignKeyConstraint(
            ["companyId"],
            ["Company.id"],
            name=op.f("AiUsage_companyId_fkey"),
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("AiUsage_pkey")),
    )
    op.create_index("AiUsage_companyId_idx", "AiUsage", ["companyId"], unique=False)
    op.create_index("AiUsage_conversationId_idx", "AiUsage", ["conversationId"], unique=False)
    op.create_index("AiUsage_customerPhone_idx", "AiUsage", ["customerPhone"], unique=False)
    op.create_index("AiUsage_createdAt_idx", "AiUsage", ["createdAt"], unique=False)


def downgrade() -> None:
    op.drop_index("AiUsage_createdAt_idx", table_name="AiUsage")
    op.drop_index("AiUsage_customerPhone_idx", table_name="AiUsage")
    op.drop_index("AiUsage_conversationId_idx", table_name="AiUsage")
    op.drop_index("AiUsage_companyId_idx", table_name="AiUsage")
    op.drop_table("AiUsage")
