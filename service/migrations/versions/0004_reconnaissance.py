from alembic import op

revision = "0004"
down_revision = "0003"

STATEMENTS = (
    """CREATE TABLE reconnaissance (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        config JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'discovering',
        model JSONB,
        plan JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    "ALTER TABLE reconnaissance ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE reconnaissance FORCE ROW LEVEL SECURITY",
    """CREATE POLICY reconnaissance_workspace ON reconnaissance USING
        (workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)""",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON reconnaissance TO demoloop_app",
    "GRANT SELECT, UPDATE ON reconnaissance TO demoloop_dispatch",
    """CREATE POLICY reconnaissance_dispatch ON reconnaissance TO demoloop_dispatch
        USING (true) WITH CHECK (true)""",
    "ALTER TABLE job ADD COLUMN reconnaissance_id UUID REFERENCES reconnaissance(id) ON DELETE CASCADE",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("ALTER TABLE job DROP COLUMN reconnaissance_id")
    op.execute("DROP TABLE reconnaissance CASCADE")
