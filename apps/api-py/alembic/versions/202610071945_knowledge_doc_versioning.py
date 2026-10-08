"""add is_current, valid_until, version to KnowledgeDocument

Revision ID: c3e7a1f4d851
Revises: b2d9f5e3c740
Create Date: 2026-10-07 19:45:00.000000

Columnas añadidas a KnowledgeDocument:
  - is_current  BOOLEAN DEFAULT TRUE   → False si el documento ha sido
                                          reemplazado o marcado como obsoleto.
  - valid_until TIMESTAMP nullable     → Fecha límite de vigencia (opcional).
                                          NULL = sin vencimiento.
  - version     INTEGER DEFAULT 1      → Versión del documento para trazabilidad.

Todas las columnas son compatibles con el esquema existente (nullable o con
default); no requieren backfill manual.  Las filas existentes quedan con
is_current=TRUE, valid_until=NULL, version=1.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c3e7a1f4d851"
down_revision: str | None = "b2d9f5e3c740"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "KnowledgeDocument",
        sa.Column("isCurrent", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "KnowledgeDocument",
        sa.Column(
            "validUntil",
            postgresql.TIMESTAMP(precision=3),
            nullable=True,
        ),
    )
    op.add_column(
        "KnowledgeDocument",
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    # Índice para acelerar la consulta de vigencia en retrieve()
    op.create_index(
        "KnowledgeDocument_isCurrent_idx",
        "KnowledgeDocument",
        ["isCurrent"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("KnowledgeDocument_isCurrent_idx", table_name="KnowledgeDocument")
    op.drop_column("KnowledgeDocument", "version")
    op.drop_column("KnowledgeDocument", "validUntil")
    op.drop_column("KnowledgeDocument", "isCurrent")
