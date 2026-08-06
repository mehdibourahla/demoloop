from alembic import op

revision = "0003"
down_revision = "0002"

STATEMENTS = (
    """CREATE TABLE production (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        scenario JSONB NOT NULL,
        config JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'capturing',
        video_key VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    "ALTER TABLE production ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE production FORCE ROW LEVEL SECURITY",
    """CREATE POLICY production_workspace ON production USING
        (workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)""",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON production TO demoloop_app",
    "GRANT SELECT, UPDATE ON production TO demoloop_dispatch",
    "CREATE POLICY production_dispatch ON production TO demoloop_dispatch USING (true) WITH CHECK (true)",
    "ALTER TABLE job ADD COLUMN production_id UUID REFERENCES production(id) ON DELETE CASCADE",
    "GRANT INSERT ON job TO demoloop_dispatch",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("ALTER TABLE job DROP COLUMN production_id")
    op.execute("DROP TABLE production CASCADE")
