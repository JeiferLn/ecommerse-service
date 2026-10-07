"""whatsapp number request

Revision ID: 9d41b7e2c058
Revises: 7c2e9f4a1b63
Create Date: 2026-10-05 21:45:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "9d41b7e2c058"
down_revision: str | None = "7c2e9f4a1b63"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "WhatsAppNumberRequest",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("companyId", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("phoneNumber", sa.Text(), nullable=True),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.Column("updatedAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.ForeignKeyConstraint(
            ["companyId"],
            ["Company.id"],
            name=op.f("WhatsAppNumberRequest_companyId_fkey"),
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("WhatsAppNumberRequest_pkey")),
    )
    op.create_index(
        "WhatsAppNumberRequest_companyId_key", "WhatsAppNumberRequest", ["companyId"], unique=True
    )


def downgrade() -> None:
    op.drop_index("WhatsAppNumberRequest_companyId_key", table_name="WhatsAppNumberRequest")
    op.drop_table("WhatsAppNumberRequest")
