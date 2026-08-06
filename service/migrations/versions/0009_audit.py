from alembic import op

revision = "0009"
down_revision = "0008"

STATEMENTS = (
    """CREATE TABLE audit_event (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        actor VARCHAR(200) NOT NULL,
        action VARCHAR(60) NOT NULL,
        subject_type VARCHAR(40) NOT NULL,
        subject_id UUID,
        detail JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    "ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE audit_event FORCE ROW LEVEL SECURITY",
    """CREATE POLICY audit_event_workspace ON audit_event USING
        (workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)""",
    # Append-only is a grant, not a convention: the application may never rewrite history.
    "GRANT SELECT, INSERT ON audit_event TO demoloop_app",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP TABLE audit_event CASCADE")
