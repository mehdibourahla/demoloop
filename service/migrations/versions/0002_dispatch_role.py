from alembic import op

revision = "0002"
down_revision = "0001"

# The claim path must cross workspaces, so it gets a permissive policy on `job`
# alone rather than BYPASSRLS, which would expose every tenant table.
STATEMENTS = (
    """DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'demoloop_dispatch') THEN
            CREATE ROLE demoloop_dispatch LOGIN PASSWORD 'demoloop_dispatch';
        END IF;
    END $$""",
    "GRANT USAGE ON SCHEMA public TO demoloop_dispatch",
    "GRANT SELECT, UPDATE ON job TO demoloop_dispatch",
    "CREATE POLICY job_dispatch ON job TO demoloop_dispatch USING (true) WITH CHECK (true)",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP POLICY job_dispatch ON job")
