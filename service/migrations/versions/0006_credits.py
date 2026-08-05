from alembic import op

revision = "0006"
down_revision = "0005"

STATEMENTS = (
    """CREATE TABLE credit_balance (
        workspace_id UUID PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
        granted NUMERIC(12,3) NOT NULL DEFAULT 0,
        spent NUMERIC(12,3) NOT NULL DEFAULT 0,
        reserved NUMERIC(12,3) NOT NULL DEFAULT 0
    )""",
    "ALTER TABLE credit_balance ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE credit_balance FORCE ROW LEVEL SECURITY",
    """CREATE POLICY credit_balance_workspace ON credit_balance USING
        (workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)""",
    "GRANT SELECT, INSERT, UPDATE ON credit_balance TO demoloop_app",
    "GRANT SELECT, UPDATE ON credit_balance TO demoloop_dispatch",
    """CREATE POLICY credit_balance_dispatch ON credit_balance TO demoloop_dispatch
        USING (true) WITH CHECK (true)""",
    "ALTER TABLE job ADD COLUMN reserved_credits NUMERIC(12,3) NOT NULL DEFAULT 0",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("ALTER TABLE job DROP COLUMN reserved_credits")
    op.execute("DROP TABLE credit_balance CASCADE")
