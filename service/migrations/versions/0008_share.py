from alembic import op

revision = "0008"
down_revision = "0007"

STATEMENTS = (
    "ALTER TABLE production ADD COLUMN provenance JSONB",
    """CREATE TABLE share_link (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        production_id UUID NOT NULL REFERENCES production(id) ON DELETE CASCADE,
        token VARCHAR(64) NOT NULL UNIQUE,
        access VARCHAR(20) NOT NULL DEFAULT 'link',
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    "ALTER TABLE share_link ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE share_link FORCE ROW LEVEL SECURITY",
    """CREATE POLICY share_link_workspace ON share_link USING
        (workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)""",
    "GRANT SELECT, INSERT, UPDATE ON share_link TO demoloop_app",
    "GRANT SELECT ON share_link TO demoloop_dispatch",
    # A share token is resolved without a session, so the public path needs its own policy.
    "CREATE POLICY share_link_public ON share_link TO demoloop_dispatch USING (true)",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP TABLE share_link CASCADE")
    op.execute("ALTER TABLE production DROP COLUMN provenance")
