"""add memory items

Revision ID: 006_add_memory_items
Revises: 005_add_indexes_and_constraints
Create Date: 2026-03-02
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "006_add_memory_items"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("knowledge_base_id", sa.Integer(), sa.ForeignKey("knowledge_bases.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("ttl_seconds", sa.Integer(), nullable=True, server_default=sa.text("-1")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_memory_kb_created_at", "memory_items", ["knowledge_base_id", "created_at"], unique=False)
    op.create_index("ix_memory_kb_expires_at", "memory_items", ["knowledge_base_id", "expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_memory_kb_expires_at", table_name="memory_items")
    op.drop_index("ix_memory_kb_created_at", table_name="memory_items")
    op.drop_table("memory_items")
