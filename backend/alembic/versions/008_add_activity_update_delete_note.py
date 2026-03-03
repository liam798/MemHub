"""Add update_note and delete_note to activity action enum

Revision ID: 008
Revises: 007
Create Date: 2025-03-03

"""
from typing import Sequence, Union

from alembic import op


revision: str = "008"
down_revision: Union[str, None] = "007_doc_content"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE activityaction ADD VALUE IF NOT EXISTS 'update_note'")
    op.execute("ALTER TYPE activityaction ADD VALUE IF NOT EXISTS 'delete_note'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values easily; leave as-is
    pass
