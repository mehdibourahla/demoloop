from alembic import op

revision = "0010"
down_revision = "0009"

STATEMENTS = (
    "ALTER TABLE environment ADD COLUMN data_policy VARCHAR(30) NOT NULL DEFAULT 'read-only'",
    "ALTER TABLE environment ADD COLUMN secret_ref VARCHAR(200)",
    "ALTER TABLE environment ADD COLUMN reset_command TEXT",
    "ALTER TABLE environment ADD COLUMN seed_command TEXT",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for column in ("seed_command", "reset_command", "secret_ref", "data_policy"):
        op.execute(f"ALTER TABLE environment DROP COLUMN {column}")
