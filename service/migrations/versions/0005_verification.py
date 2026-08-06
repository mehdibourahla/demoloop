from alembic import op

revision = "0005"
down_revision = "0004"

STATEMENTS = (
    """CREATE TABLE verification (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        production_id UUID NOT NULL REFERENCES production(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'checking',
        drifted JSONB NOT NULL DEFAULT '[]'::jsonb,
        checked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    "ALTER TABLE verification ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE verification FORCE ROW LEVEL SECURITY",
    """CREATE POLICY verification_workspace ON verification USING
        (workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)""",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON verification TO demoloop_app",
    "GRANT SELECT, UPDATE ON verification TO demoloop_dispatch",
    """CREATE POLICY verification_dispatch ON verification TO demoloop_dispatch
        USING (true) WITH CHECK (true)""",
    "ALTER TABLE job ADD COLUMN verification_id UUID REFERENCES verification(id) ON DELETE CASCADE",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("ALTER TABLE job DROP COLUMN verification_id")
    op.execute("DROP TABLE verification CASCADE")
