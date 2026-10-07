"""whatsapp display number unique

Revision ID: 7c2e9f4a1b63
Revises: 38baae66b701
Create Date: 2026-10-05 21:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7c2e9f4a1b63"
down_revision: str | None = "38baae66b701"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "WhatsAppConnection_displayPhoneNumber_key",
        "WhatsAppConnection",
        ["displayPhoneNumber"],
        unique=True,
        postgresql_where=sa.text('"displayPhoneNumber" IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index("WhatsAppConnection_displayPhoneNumber_key", table_name="WhatsAppConnection")
