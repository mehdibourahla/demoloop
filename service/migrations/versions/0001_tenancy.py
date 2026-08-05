from alembic import op

revision = "0001"
down_revision = None

SCOPED = ("membership", "product", "environment", "job")

# asyncpg refuses multiple commands in one prepared statement, so each runs alone.
STATEMENTS = (
    """DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'demoloop_app') THEN
            CREATE ROLE demoloop_app LOGIN PASSWORD 'demoloop_app';
        END IF;
    END $$""",
    """CREATE TABLE workspace (
        id UUID PRIMARY KEY,
        name VARCHAR(200) NOT NULL
    )""",
    """CREATE TABLE membership (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        user_id VARCHAR(200) NOT NULL,
        role VARCHAR(20) NOT NULL,
        UNIQUE (workspace_id, user_id)
    )""",
    """CREATE TABLE product (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL
    )""",
    """CREATE TABLE environment (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        url VARCHAR(2000) NOT NULL,
        is_production BOOLEAN NOT NULL DEFAULT FALSE
    )""",
    """CREATE TABLE job (
        id UUID PRIMARY KEY,
        workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        kind VARCHAR(40) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        payload JSONB NOT NULL,
        result JSONB,
        lease_token UUID,
        leased_until TIMESTAMPTZ,
        attempt INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""",
    "CREATE INDEX job_claimable ON job (kind, status, leased_until)",
)


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)
    for table in SCOPED:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_workspace ON {table} USING "
            f"(workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)"
        )
    op.execute("GRANT USAGE ON SCHEMA public TO demoloop_app")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO demoloop_app")


def downgrade() -> None:
    op.execute("DROP TABLE job, environment, product, membership, workspace CASCADE")
