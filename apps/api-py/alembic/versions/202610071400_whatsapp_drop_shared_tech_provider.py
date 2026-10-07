"""drop whatsapp shared number; add tech provider onboarding fields

Revision ID: a1c8e4f2b639
Revises: 9d41b7e2c058
Create Date: 2026-10-07 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1c8e4f2b639"
down_revision: str | None = "9d41b7e2c058"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

wa_kind = postgresql.ENUM("own_number", "platform_number", name="WhatsAppConnectionKind", create_type=False)
wa_onboarding = postgresql.ENUM(
    "pending",
    "awaiting_meta",
    "registering",
    "online",
    "failed",
    name="WhatsAppOnboardingStatus",
    create_type=False,
)


def upgrade() -> None:
    # Preservar historial: ON DELETE CASCADE borraría las conversaciones.
    op.execute(
        sa.text(
            """
            UPDATE "Conversation" AS c
            SET "waConnectionId" = NULL
            FROM "WhatsAppConnection" AS w
            WHERE c."waConnectionId" = w.id AND w.mode = 'shared'
            """
        )
    )
    op.execute(sa.text('DELETE FROM "SharedNumberSession"'))
    op.drop_index("SharedNumberSession_customerWaId_key", table_name="SharedNumberSession")
    op.drop_index("SharedNumberSession_connectionId_idx", table_name="SharedNumberSession")
    op.drop_table("SharedNumberSession")

    op.execute(sa.text("DELETE FROM \"WhatsAppConnection\" WHERE mode = 'shared'"))
    op.drop_index("WhatsAppConnection_storeCode_key", table_name="WhatsAppConnection")
    op.drop_column("WhatsAppConnection", "storeCode")

    op.drop_column("PlatformSettings", "sharedWhatsAppNumber")

    wa_kind.create(op.get_bind(), checkfirst=True)
    wa_onboarding.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "WhatsAppConnection",
        sa.Column(
            "connectionKind",
            wa_kind,
            nullable=False,
            server_default="platform_number",
        ),
    )
    op.add_column(
        "WhatsAppConnection",
        sa.Column(
            "onboardingStatus",
            wa_onboarding,
            nullable=False,
            server_default="online",
        ),
    )
    op.add_column("WhatsAppConnection", sa.Column("wabaId", sa.Text(), nullable=True))
    op.add_column("WhatsAppConnection", sa.Column("metaPhoneNumberId", sa.Text(), nullable=True))
    op.add_column("WhatsAppConnection", sa.Column("twilioSubaccountSid", sa.Text(), nullable=True))
    op.add_column("WhatsAppConnection", sa.Column("twilioSenderSid", sa.Text(), nullable=True))
    op.add_column("WhatsAppConnection", sa.Column("onboardingError", sa.Text(), nullable=True))
    op.alter_column("WhatsAppConnection", "twilioWhatsAppNumber", existing_type=sa.Text(), nullable=True)

    op.drop_index("WhatsAppConnection_dedicated_number_key", table_name="WhatsAppConnection")
    op.create_index(
        "WhatsAppConnection_dedicated_number_key",
        "WhatsAppConnection",
        ["twilioWhatsAppNumber"],
        unique=True,
        postgresql_where=sa.text("mode = 'dedicated' AND \"twilioWhatsAppNumber\" IS NOT NULL"),
    )

    op.alter_column("WhatsAppConnection", "connectionKind", server_default=None)
    op.alter_column("WhatsAppConnection", "onboardingStatus", server_default=None)


def downgrade() -> None:
    op.drop_index("WhatsAppConnection_dedicated_number_key", table_name="WhatsAppConnection")
    op.create_index(
        "WhatsAppConnection_dedicated_number_key",
        "WhatsAppConnection",
        ["twilioWhatsAppNumber"],
        unique=True,
        postgresql_where=sa.text("mode = 'dedicated'"),
    )

    op.execute(
        sa.text(
            'UPDATE "WhatsAppConnection" SET "twilioWhatsAppNumber" = \'+00000000000\' '
            'WHERE "twilioWhatsAppNumber" IS NULL'
        )
    )
    op.alter_column("WhatsAppConnection", "twilioWhatsAppNumber", existing_type=sa.Text(), nullable=False)

    op.drop_column("WhatsAppConnection", "onboardingError")
    op.drop_column("WhatsAppConnection", "twilioSenderSid")
    op.drop_column("WhatsAppConnection", "twilioSubaccountSid")
    op.drop_column("WhatsAppConnection", "metaPhoneNumberId")
    op.drop_column("WhatsAppConnection", "wabaId")
    op.drop_column("WhatsAppConnection", "onboardingStatus")
    op.drop_column("WhatsAppConnection", "connectionKind")
    wa_onboarding.drop(op.get_bind(), checkfirst=True)
    wa_kind.drop(op.get_bind(), checkfirst=True)

    op.add_column("PlatformSettings", sa.Column("sharedWhatsAppNumber", sa.Text(), nullable=True))
    op.add_column("WhatsAppConnection", sa.Column("storeCode", sa.Text(), nullable=True))
    op.create_index("WhatsAppConnection_storeCode_key", "WhatsAppConnection", ["storeCode"], unique=True)

    op.create_table(
        "SharedNumberSession",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("customerWaId", sa.Text(), nullable=False),
        sa.Column("connectionId", sa.Text(), nullable=False),
        sa.Column("createdAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.Column("updatedAt", postgresql.TIMESTAMP(precision=3), nullable=False),
        sa.ForeignKeyConstraint(
            ["connectionId"],
            ["WhatsAppConnection.id"],
            name="SharedNumberSession_connectionId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "SharedNumberSession_connectionId_idx", "SharedNumberSession", ["connectionId"], unique=False
    )
    op.create_index(
        "SharedNumberSession_customerWaId_key", "SharedNumberSession", ["customerWaId"], unique=True
    )
