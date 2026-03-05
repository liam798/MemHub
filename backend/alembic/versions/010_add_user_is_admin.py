"""add users.is_admin

Revision ID: 010
Revises: 009
Create Date: 2026-03-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(conn, table: str, column: str) -> bool:
    return (
        conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": table, "column": column},
        ).first()
        is not None
    )


def upgrade() -> None:
    conn = op.get_bind()
    if not _has_column(conn, "users", "is_admin"):
        op.add_column(
            "users",
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )

    # 兼容已有数据：若当前没有管理员，则将最早注册的用户提升为管理员
    has_admin = conn.execute(sa.text("SELECT 1 FROM users WHERE is_admin = true LIMIT 1")).first()
    if has_admin is None:
        conn.execute(
            sa.text(
                "UPDATE users SET is_admin = true "
                "WHERE id = (SELECT id FROM users ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1)"
            )
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _has_column(conn, "users", "is_admin"):
        op.drop_column("users", "is_admin")
