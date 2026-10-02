"""Esquema base heredado de Prisma.

En una base nueva crea todo el esquema. En una base que ya tenía las migraciones de Prisma
se marca como aplicada con `alembic stamp head`.

Revision ID: 20261002000000
Revises:
Create Date: 2026-10-02
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "20261002000000"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BASELINE_SQL = Path(__file__).resolve().parents[1] / "baseline.sql"


def _statements(sql: str) -> list[str]:
    # El SQL de Prisma no usa bloques `$$`; solo los comentarios pueden llevar `;`.
    lines = [line for line in sql.splitlines() if not line.lstrip().startswith("--")]
    return [statement.strip() for statement in "\n".join(lines).split(";") if statement.strip()]


def upgrade() -> None:
    for statement in _statements(BASELINE_SQL.read_text(encoding="utf-8")):
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("El esquema base no se revierte")
