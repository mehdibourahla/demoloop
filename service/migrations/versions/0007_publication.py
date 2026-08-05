from alembic import op

revision = "0007"
down_revision = "0006"

STATEMENTS = (
    "ALTER TABLE production ADD COLUMN quality JSONB",
    "ALTER TABLE production ADD COLUMN review JSONB",
    "ALTER TABLE production ADD COLUMN published_at TIMESTAMPTZ",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for column in ("published_at", "review", "quality"):
        op.execute(f"ALTER TABLE production DROP COLUMN {column}")
