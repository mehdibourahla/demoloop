# Service spine implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A capture job flows from the API to a runner and back — leased over HTTP, executed by
the existing engine, reported with provenance — under database-enforced tenant isolation.

**Architecture:** A Python/FastAPI service owns tenancy, the job ledger and the lease protocol;
it never calls the engine. A thin Node runner leases jobs and invokes the unmodified `demoloop`
package. Isolation is enforced by Postgres row-level security, not by application filters.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2 async, asyncpg, Alembic, Pydantic 2, pytest +
pytest-asyncio, ruff, uv workspace. Node 22 for the runner.

## Global Constraints

- Python `>=3.13`. Node `>=22`.
- Every dependency capped at its next major, so a breaking release cannot enter the lockfile.
- The service never imports engine logic. It shells out to the `demoloop` CLI or dispatches jobs.
- Every tenant-scoped table carries `workspace_id` and has `FORCE ROW LEVEL SECURITY`.
- The application's database role is never the table owner's superuser and never bypasses RLS.
- No comments in code except a single line for a non-obvious why.
- Secrets are referenced by identifier, never by value, in any job payload or log.

## Plan sequence

This is plan 1 of 6. Each produces working, testable software on its own.

1. **Service spine** (this plan) — tenancy, job ledger, lease protocol, runner.
2. Artifact custody — signed uploads, object layout, retention.
3. Production pipeline — plan/render/evaluate cloud workers, run state machine.
4. Agent layer — reconnaissance, director, review, maintainer on ADK.
5. Studio — SPA, SSE streams, storyboard, player.
6. Commerce and governance — credits, Stripe, roles, audit log, admin.

## File structure

| Path | Responsibility |
|---|---|
| `service/pyproject.toml` | uv workspace root |
| `service/packages/libs/demoloop-core/src/demoloop_core/settings.py` | typed settings |
| `service/packages/libs/demoloop-core/src/demoloop_core/db.py` | engine, session, workspace scoping |
| `service/packages/libs/demoloop-core/src/demoloop_core/models.py` | SQLAlchemy models |
| `service/packages/libs/demoloop-core/src/demoloop_core/jobs.py` | ledger: enqueue, claim, beat, finish |
| `service/packages/apps/demoloop-api/src/demoloop_api/app.py` | FastAPI application |
| `service/packages/apps/demoloop-api/src/demoloop_api/routers/runner.py` | lease endpoints |
| `service/migrations/` | Alembic |
| `runner/src/agent.ts` | lease loop, engine invocation, reporting |

---

### Task 1: Workspace skeleton and health endpoint

**Files:**
- Create: `service/pyproject.toml`, `service/packages/libs/demoloop-core/pyproject.toml`,
  `service/packages/libs/demoloop-core/src/demoloop_core/__init__.py`,
  `service/packages/libs/demoloop-core/src/demoloop_core/settings.py`,
  `service/packages/apps/demoloop-api/pyproject.toml`,
  `service/packages/apps/demoloop-api/src/demoloop_api/__init__.py`,
  `service/packages/apps/demoloop-api/src/demoloop_api/app.py`
- Test: `service/packages/apps/demoloop-api/tests/test_health.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `demoloop_core.settings.Settings` with fields `database_url: str`,
  `runner_shared_secret: str`, `env: str`; `demoloop_api.app.create_app() -> FastAPI`.

- [ ] **Step 1: Write the failing test**

```python
# service/packages/apps/demoloop-api/tests/test_health.py
from fastapi.testclient import TestClient

from demoloop_api.app import create_app


def test_health_reports_the_running_environment():
    client = TestClient(create_app())

    response = client.get("/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "env": "test"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd service && uv run pytest packages/apps/demoloop-api/tests/test_health.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'demoloop_api'`

- [ ] **Step 3: Write the workspace files**

```toml
# service/pyproject.toml
[tool.uv.workspace]
members = ["packages/libs/*", "packages/apps/*"]

[tool.uv]
dev-dependencies = [
    "pytest>=8,<10",
    "pytest-asyncio>=0.24,<2",
    "ruff>=0.8,<1",
]
```

```toml
# service/packages/libs/demoloop-core/pyproject.toml
[project]
name = "demoloop-core"
version = "0.0.0"
requires-python = ">=3.13"
dependencies = [
    "pydantic>=2.11,<3",
    "pydantic-settings>=2.9,<3",
    "sqlalchemy[asyncio]>=2,<3",
    "asyncpg>=0.30,<1",
    "alembic>=1.14,<2",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/demoloop_core"]
```

```toml
# service/packages/apps/demoloop-api/pyproject.toml
[project]
name = "demoloop-api"
version = "0.0.0"
requires-python = ">=3.13"
dependencies = [
    "demoloop-core",
    "fastapi>=0.123,<1",
    "uvicorn[standard]>=0.40,<1",
    "httpx>=0.27,<1",
]

[tool.uv.sources]
demoloop-core = { workspace = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/demoloop_api"]
```

```python
# service/packages/libs/demoloop-core/src/demoloop_core/settings.py
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DEMOLOOP_", env_file=".env", extra="ignore")

    env: str = "test"
    database_url: str = "postgresql+asyncpg://demoloop:demoloop@127.0.0.1:5432/demoloop"
    runner_shared_secret: str = "development-only"


@lru_cache
def settings() -> Settings:
    return Settings()
```

```python
# service/packages/apps/demoloop-api/src/demoloop_api/app.py
from fastapi import FastAPI

from demoloop_core.settings import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Demoloop")

    @app.get("/v1/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings().env}

    return app
```

Create empty `__init__.py` for both packages.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd service && uv sync && uv run pytest packages/apps/demoloop-api/tests/test_health.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add service
git commit -m "Add the service workspace skeleton"
```

---

### Task 2: Tenancy schema with enforced row-level security

**Files:**
- Create: `service/packages/libs/demoloop-core/src/demoloop_core/models.py`,
  `service/migrations/env.py`, `service/migrations/versions/0001_tenancy.py`,
  `service/alembic.ini`
- Test: `service/packages/libs/demoloop-core/tests/test_tenancy.py`

**Interfaces:**
- Consumes: `demoloop_core.settings.settings`.
- Produces: `Base`, `Workspace(id, name)`, `Membership(workspace_id, user_id, role)`,
  `Product(id, workspace_id, name)`, `Environment(id, workspace_id, product_id, name, url,
  is_production)`.

The migration must both create the tables and enable `FORCE ROW LEVEL SECURITY`, because a
policy that the table owner bypasses is not isolation.

- [ ] **Step 1: Write the failing test**

```python
# service/packages/libs/demoloop-core/tests/test_tenancy.py
import uuid

import pytest
from sqlalchemy import select

from demoloop_core.db import workspace_session
from demoloop_core.models import Product


@pytest.mark.asyncio
async def test_a_workspace_cannot_read_another_workspaces_products(seeded_workspaces):
    first, second = seeded_workspaces

    async with workspace_session(first) as session:
        visible = (await session.scalars(select(Product))).all()

    assert [product.workspace_id for product in visible] == [first]
    assert second not in {product.workspace_id for product in visible}


@pytest.mark.asyncio
async def test_an_unscoped_session_sees_nothing(seeded_workspaces):
    async with workspace_session(uuid.uuid4()) as session:
        assert (await session.scalars(select(Product))).all() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd service && uv run pytest packages/libs/demoloop-core/tests/test_tenancy.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'demoloop_core.models'`

- [ ] **Step 3: Write the models and migration**

```python
# service/packages/libs/demoloop-core/src/demoloop_core/models.py
import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspace"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))


class Membership(Base):
    __tablename__ = "membership"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))


class Product(Base):
    __tablename__ = "product"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))


class Environment(Base):
    __tablename__ = "environment"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    url: Mapped[str] = mapped_column(String(2000))
    is_production: Mapped[bool] = mapped_column(Boolean, default=False)
```

```python
# service/migrations/versions/0001_tenancy.py
from alembic import op

revision = "0001"
down_revision = None

SCOPED = ("membership", "product", "environment")


def upgrade() -> None:
    op.execute("""
        CREATE TABLE workspace (
            id UUID PRIMARY KEY,
            name VARCHAR(200) NOT NULL
        );
        CREATE TABLE membership (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
            user_id VARCHAR(200) NOT NULL,
            role VARCHAR(20) NOT NULL,
            UNIQUE (workspace_id, user_id)
        );
        CREATE TABLE product (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL
        );
        CREATE TABLE environment (
            id UUID PRIMARY KEY,
            workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
            product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            url VARCHAR(2000) NOT NULL,
            is_production BOOLEAN NOT NULL DEFAULT FALSE
        );
    """)
    for table in SCOPED:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_workspace ON {table} USING "
            f"(workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid)"
        )


def downgrade() -> None:
    op.execute("DROP TABLE environment, product, membership, workspace CASCADE")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd service && uv run alembic upgrade head && uv run pytest packages/libs/demoloop-core/tests/test_tenancy.py -v`
Expected: PASS — both tests, including the unscoped session seeing nothing

- [ ] **Step 5: Commit**

```bash
git add service
git commit -m "Enforce workspace isolation in the database"
```

---

### Task 3: Workspace-scoped session

**Files:**
- Create: `service/packages/libs/demoloop-core/src/demoloop_core/db.py`
- Test: `service/packages/libs/demoloop-core/tests/conftest.py`

**Interfaces:**
- Consumes: `Settings.database_url`, `Base`.
- Produces: `workspace_session(workspace_id: uuid.UUID) -> AsyncIterator[AsyncSession]`, which
  sets `demoloop.workspace_id` for the transaction's lifetime.

`SET LOCAL` is used rather than `SET` so the scoping cannot leak to the next checkout of a
pooled connection.

- [ ] **Step 1: Write the failing test**

```python
# service/packages/libs/demoloop-core/tests/conftest.py
import uuid

import pytest_asyncio
from sqlalchemy import text

from demoloop_core.db import engine, workspace_session
from demoloop_core.models import Product, Workspace


@pytest_asyncio.fixture
async def seeded_workspaces():
    first, second = uuid.uuid4(), uuid.uuid4()
    async with engine().begin() as connection:
        await connection.execute(text("TRUNCATE workspace CASCADE"))
        for identifier in (first, second):
            await connection.execute(
                text("INSERT INTO workspace (id, name) VALUES (:id, :name)"),
                {"id": identifier, "name": str(identifier)},
            )
            await connection.execute(
                text("INSERT INTO product (id, workspace_id, name) VALUES (:id, :workspace, 'App')"),
                {"id": uuid.uuid4(), "workspace": identifier},
            )
    return first, second
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd service && uv run pytest packages/libs/demoloop-core/tests -v`
Expected: FAIL with `ImportError: cannot import name 'engine' from 'demoloop_core.db'`

- [ ] **Step 3: Write the implementation**

```python
# service/packages/libs/demoloop-core/src/demoloop_core/db.py
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from demoloop_core.settings import settings


@lru_cache
def engine() -> AsyncEngine:
    return create_async_engine(settings().database_url, pool_pre_ping=True)


@asynccontextmanager
async def workspace_session(workspace_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine()) as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('demoloop.workspace_id', :workspace, true)"),
                {"workspace": str(workspace_id)},
            )
            yield session
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd service && uv run pytest packages/libs/demoloop-core/tests -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add service
git commit -m "Scope database sessions to one workspace per transaction"
```

---

### Task 4: Job ledger

**Files:**
- Create: `service/packages/libs/demoloop-core/src/demoloop_core/jobs.py`,
  `service/migrations/versions/0002_jobs.py`
- Modify: `service/packages/libs/demoloop-core/src/demoloop_core/models.py`
- Test: `service/packages/libs/demoloop-core/tests/test_jobs.py`

**Interfaces:**
- Consumes: `workspace_session`, `Base`.
- Produces: `enqueue(session, workspace_id, kind, payload) -> Job`,
  `claim(session, kinds: list[str], lease_seconds: int) -> Job | None`,
  `beat(session, job_id, lease_token, lease_seconds=60) -> bool`,
  `finish(session, job_id, lease_token, result: dict) -> bool`.
  `Job` has `id, workspace_id, kind, status, payload, result, lease_token, leased_until, attempt`.
  Also adds `demoloop_core.db.privileged_session() -> AsyncIterator[AsyncSession]`, a session
  with no workspace set, used only by the claim path.

Claiming uses `FOR UPDATE SKIP LOCKED` so two workers never take the same row. Claiming crosses
workspaces by design — a runner serves whichever workspace it is bound to — so `claim` runs on a
privileged session, and every read it returns is re-scoped before use.

- [ ] **Step 1: Write the failing test**

```python
# service/packages/libs/demoloop-core/tests/test_jobs.py
import pytest

from demoloop_core.db import privileged_session, workspace_session
from demoloop_core.jobs import beat, claim, enqueue, finish


@pytest.mark.asyncio
async def test_two_workers_never_claim_the_same_job(seeded_workspaces):
    first, _ = seeded_workspaces
    async with workspace_session(first) as session:
        await enqueue(session, first, "capture", {"scenario": "demo"})

    async with privileged_session() as one, privileged_session() as two:
        claimed = await claim(one, ["capture"], lease_seconds=60)
        contended = await claim(two, ["capture"], lease_seconds=60)

    assert claimed is not None
    assert contended is None


@pytest.mark.asyncio
async def test_an_expired_lease_returns_the_job_to_the_queue(seeded_workspaces):
    first, _ = seeded_workspaces
    async with workspace_session(first) as session:
        await enqueue(session, first, "capture", {"scenario": "demo"})

    async with privileged_session() as session:
        first_claim = await claim(session, ["capture"], lease_seconds=-1)
        reclaimed = await claim(session, ["capture"], lease_seconds=60)

    assert reclaimed is not None
    assert reclaimed.id == first_claim.id
    assert reclaimed.attempt == first_claim.attempt + 1


@pytest.mark.asyncio
async def test_a_stale_lease_token_cannot_finish_the_job(seeded_workspaces):
    first, _ = seeded_workspaces
    async with workspace_session(first) as session:
        await enqueue(session, first, "capture", {"scenario": "demo"})

    async with privileged_session() as session:
        job = await claim(session, ["capture"], lease_seconds=60)

        assert await finish(session, job.id, "not-the-token", {"passed": True}) is False
        assert await finish(session, job.id, job.lease_token, {"passed": True}) is True
        assert await beat(session, job.id, job.lease_token) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd service && uv run pytest packages/libs/demoloop-core/tests/test_jobs.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'demoloop_core.jobs'`

- [ ] **Step 3: Write the migration, model and functions**

```python
# service/migrations/versions/0002_jobs.py
from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.execute("""
        CREATE TABLE job (
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
        );
        CREATE INDEX job_claimable ON job (kind, status, leased_until);
        ALTER TABLE job ENABLE ROW LEVEL SECURITY;
        ALTER TABLE job FORCE ROW LEVEL SECURITY;
        CREATE POLICY job_workspace ON job USING
            (workspace_id = NULLIF(current_setting('demoloop.workspace_id', true), '')::uuid);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE job CASCADE")
```

Add to `models.py`:

```python
import datetime

from sqlalchemy import DateTime, Integer
from sqlalchemy.dialects.postgresql import JSONB


class Job(Base):
    __tablename__ = "job"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspace.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    payload: Mapped[dict] = mapped_column(JSONB)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    leased_until: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=0)
```

```python
# service/packages/libs/demoloop-core/src/demoloop_core/jobs.py
import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from demoloop_core.models import Job

CLAIM = text("""
    UPDATE job SET
        status = 'leased',
        lease_token = gen_random_uuid(),
        leased_until = now() + make_interval(secs => :lease_seconds),
        attempt = attempt + 1
    WHERE id = (
        SELECT id FROM job
        WHERE kind = ANY(:kinds)
          AND status IN ('queued', 'leased')
          AND (leased_until IS NULL OR leased_until < now())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, workspace_id, kind, status, payload, lease_token, leased_until, attempt
""")


async def enqueue(session: AsyncSession, workspace_id: uuid.UUID, kind: str, payload: dict) -> Job:
    job = Job(workspace_id=workspace_id, kind=kind, payload=payload)
    session.add(job)
    await session.flush()
    return job


async def claim(session: AsyncSession, kinds: list[str], lease_seconds: int) -> Job | None:
    row = (await session.execute(CLAIM, {"kinds": kinds, "lease_seconds": lease_seconds})).mappings().one_or_none()
    return Job(**row) if row else None


async def beat(session: AsyncSession, job_id: uuid.UUID, lease_token: uuid.UUID, lease_seconds: int = 60) -> bool:
    result = await session.execute(
        text("""
            UPDATE job SET leased_until = now() + make_interval(secs => :lease_seconds)
            WHERE id = :id AND lease_token = :token AND status = 'leased'
        """),
        {"id": job_id, "token": lease_token, "lease_seconds": lease_seconds},
    )
    return result.rowcount == 1


async def finish(session: AsyncSession, job_id: uuid.UUID, lease_token: uuid.UUID, result: dict) -> bool:
    outcome = await session.execute(
        text("""
            UPDATE job SET status = 'done', result = CAST(:result AS JSONB), leased_until = NULL
            WHERE id = :id AND lease_token = :token AND status = 'leased'
        """),
        {"id": job_id, "token": lease_token, "result": json.dumps(result)},
    )
    return outcome.rowcount == 1
```

Add `privileged_session` to `db.py`, which opens a session without setting the workspace and is
used only by the claim path:

```python
@asynccontextmanager
async def privileged_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSession(engine()) as session:
        async with session.begin():
            yield session
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd service && uv run alembic upgrade head && uv run pytest packages/libs/demoloop-core/tests/test_jobs.py -v`
Expected: PASS — all three tests

- [ ] **Step 5: Commit**

```bash
git add service
git commit -m "Add the job ledger with skip-locked claiming"
```

---

### Task 5: Runner lease endpoints

**Files:**
- Create: `service/packages/apps/demoloop-api/src/demoloop_api/routers/runner.py`,
  `service/packages/apps/demoloop-api/tests/conftest.py`
- Modify: `service/packages/apps/demoloop-api/src/demoloop_api/app.py`
- Test: `service/packages/apps/demoloop-api/tests/test_runner_api.py`

**Interfaces:**
- Consumes: `claim`, `beat`, `finish`, `privileged_session`.
- Produces: `POST /v1/jobs/lease`, `POST /v1/jobs/{id}/beat`, `POST /v1/jobs/{id}/finish`.
  Lease returns `{"job": {...}, "lease_token": str, "lease_seconds": int}` or `204` when idle.

Runners authenticate with a bearer token. An unauthenticated lease must never return a job,
because a job payload names a customer environment.

- [ ] **Step 1: Write the failing test**

```python
# service/packages/apps/demoloop-api/tests/test_runner_api.py
from fastapi.testclient import TestClient

from demoloop_api.app import create_app

HEADERS = {"Authorization": "Bearer development-only"}


def test_an_unauthenticated_runner_is_refused():
    client = TestClient(create_app())

    response = client.post("/v1/jobs/lease", json={"kinds": ["capture"]})

    assert response.status_code == 401


def test_leasing_returns_no_content_when_nothing_is_queued():
    client = TestClient(create_app())

    response = client.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS)

    assert response.status_code == 204


def test_a_leased_job_can_only_be_finished_with_its_token(queued_capture_job):
    client = TestClient(create_app())
    leased = client.post("/v1/jobs/lease", json={"kinds": ["capture"]}, headers=HEADERS).json()

    wrong = client.post(
        f"/v1/jobs/{leased['job']['id']}/finish",
        json={"lease_token": "00000000-0000-0000-0000-000000000000", "result": {"passed": True}},
        headers=HEADERS,
    )
    right = client.post(
        f"/v1/jobs/{leased['job']['id']}/finish",
        json={"lease_token": leased["lease_token"], "result": {"passed": True}},
        headers=HEADERS,
    )

    assert wrong.status_code == 409
    assert right.status_code == 200
```

Its fixture, which seeds one queued capture job:

```python
# service/packages/apps/demoloop-api/tests/conftest.py
import uuid

import pytest
from sqlalchemy import text

from demoloop_core.db import engine


@pytest.fixture
def queued_capture_job(anyio_backend=None):
    import asyncio

    async def seed() -> uuid.UUID:
        workspace = uuid.uuid4()
        async with engine().begin() as connection:
            await connection.execute(text("TRUNCATE workspace CASCADE"))
            await connection.execute(
                text("INSERT INTO workspace (id, name) VALUES (:id, 'Fixture')"), {"id": workspace}
            )
            await connection.execute(
                text("INSERT INTO job (id, workspace_id, kind, payload) VALUES (:id, :workspace, 'capture', '{}')"),
                {"id": uuid.uuid4(), "workspace": workspace},
            )
        return workspace

    return asyncio.get_event_loop().run_until_complete(seed())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd service && uv run pytest packages/apps/demoloop-api/tests/test_runner_api.py -v`
Expected: FAIL with `assert 404 == 401`

- [ ] **Step 3: Write the router**

```python
# service/packages/apps/demoloop-api/src/demoloop_api/routers/runner.py
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from demoloop_core.db import privileged_session
from demoloop_core.jobs import beat, claim, finish
from demoloop_core.settings import settings

router = APIRouter(prefix="/v1/jobs", tags=["runner"])
bearer = HTTPBearer(auto_error=False)

LEASE_SECONDS = 60


def authenticated(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    if credentials is None or credentials.credentials != settings().runner_shared_secret:
        raise HTTPException(status_code=401, detail="runner authentication required")


class LeaseRequest(BaseModel):
    kinds: list[str]


class TokenRequest(BaseModel):
    lease_token: uuid.UUID


class FinishRequest(TokenRequest):
    result: dict


@router.post("/lease", dependencies=[Depends(authenticated)])
async def lease(request: LeaseRequest, response: Response) -> dict | Response:
    async with privileged_session() as session:
        job = await claim(session, request.kinds, LEASE_SECONDS)
        if job is None:
            return Response(status_code=204)
        return {
            "job": {"id": str(job.id), "kind": job.kind, "payload": job.payload, "attempt": job.attempt},
            "lease_token": str(job.lease_token),
            "lease_seconds": LEASE_SECONDS,
        }


@router.post("/{job_id}/beat", dependencies=[Depends(authenticated)])
async def heartbeat(job_id: uuid.UUID, request: TokenRequest) -> dict:
    async with privileged_session() as session:
        if not await beat(session, job_id, request.lease_token, LEASE_SECONDS):
            raise HTTPException(status_code=409, detail="lease lost")
    return {"continue": True}


@router.post("/{job_id}/finish", dependencies=[Depends(authenticated)])
async def complete(job_id: uuid.UUID, request: FinishRequest) -> dict:
    async with privileged_session() as session:
        if not await finish(session, job_id, request.lease_token, request.result):
            raise HTTPException(status_code=409, detail="lease lost")
    return {"accepted": True}
```

Register it in `app.py` with `app.include_router(runner.router)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd service && uv run pytest packages/apps/demoloop-api/tests -v`
Expected: PASS — all four tests

- [ ] **Step 5: Commit**

```bash
git add service
git commit -m "Add the runner lease endpoints"
```

---

### Task 6: The runner agent

**Files:**
- Create: `runner/package.json`, `runner/src/agent.ts`, `runner/tests/agent.test.ts`
- Test: `runner/tests/agent.test.ts`

**Interfaces:**
- Consumes: the lease endpoints from Task 5; the `demoloop` package's `executeScenario`.
- Produces: `runOnce(deps: AgentDeps) -> 'idle' | 'completed' | 'failed'`. The HTTP client that
  satisfies `AgentDeps` holds the API URL and token; `runOnce` itself is transport-free so it is
  testable without a server.

The agent must refuse to upload a capture whose report contains a secret-kind finding. That is
the severity split from the architecture, and it is the runner's job because the runner is the
last place the artifacts are still inside the customer's trust boundary.

- [ ] **Step 1: Write the failing test**

```typescript
// runner/tests/agent.test.ts
import { describe, expect, test } from 'vitest';
import { runOnce } from '../src/agent.js';

const job = {
  job: { id: 'job-1', kind: 'capture', payload: { scenario: {}, config: {} }, attempt: 1 },
  lease_token: 'token-1',
  lease_seconds: 60
};

test('reports idle when the queue is empty', async () => {
  const result = await runOnce({ lease: async () => undefined, capture: async () => ({}), finish: async () => {} });

  expect(result).toBe('idle');
});

test('refuses to report a capture that caught a credential', async () => {
  const finished: unknown[] = [];
  const capture = async () => ({ passed: true, sensitiveFindings: [{ kind: 'secret', source: 'text-login', count: 1 }] });

  const result = await runOnce({ lease: async () => job, capture, finish: async (_id, _token, body) => { finished.push(body); } });

  expect(result).toBe('failed');
  expect(JSON.stringify(finished)).toContain('withheld');
  expect(JSON.stringify(finished)).not.toContain('text-login');
});

test('reports a clean capture', async () => {
  const finished: any[] = [];
  const capture = async () => ({ passed: true, sensitiveFindings: [] });

  const result = await runOnce({ lease: async () => job, capture, finish: async (_id, _token, body) => { finished.push(body); } });

  expect(result).toBe('completed');
  expect(finished[0].result.passed).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd runner && npx vitest run tests/agent.test.ts`
Expected: FAIL with `Cannot find module '../src/agent.js'`

- [ ] **Step 3: Write the agent**

```typescript
// runner/src/agent.ts
export interface LeasedJob { job: { id: string; kind: string; payload: Record<string, unknown>; attempt: number }; lease_token: string; lease_seconds: number }
export interface AgentDeps {
  lease(kinds: string[]): Promise<LeasedJob | undefined>;
  capture(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  finish(id: string, token: string, body: Record<string, unknown>): Promise<void>;
}

export async function runOnce(deps: AgentDeps): Promise<'idle' | 'completed' | 'failed'> {
  const leased = await deps.lease(['capture']);
  if (!leased) return 'idle';
  const report = await deps.capture(leased.job.payload);
  const findings = (report.sensitiveFindings ?? []) as Array<{ kind: string }>;
  if (findings.some((finding) => finding.kind === 'secret')) {
    await deps.finish(leased.job.id, leased.lease_token, { result: { passed: false, withheld: 'capture caught a credential; artifacts were not uploaded' } });
    return 'failed';
  }
  await deps.finish(leased.job.id, leased.lease_token, { result: report });
  return 'completed';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd runner && npx vitest run tests/agent.test.ts`
Expected: PASS — all three tests

- [ ] **Step 5: Commit**

```bash
git add runner
git commit -m "Add the runner agent with a credential withholding gate"
```

---

## Definition of done

- `cd service && uv run pytest` green; `uv run ruff check packages` clean.
- `cd runner && npx vitest run` green.
- A capture job enqueued for one workspace is invisible to another, proven by test, not by review.
- A runner without the shared secret receives no job payload.
- A capture that caught a credential reports failure and uploads nothing.

---

## Executed 2026-08-05

All six tasks are implemented and committed. `uv run pytest` reports 10 passed, `ruff check`
is clean, and the engine suite is 160 passing across 35 files.

Nine corrections were found by executing the plan. They apply to plans 2 through 6.

| # | Correction |
|---|---|
| 1 | Both workspace member `pyproject.toml` files must exist before any test can run, because `uv` resolves the workspace globs first. Scaffolding precedes the first red test. |
| 2 | Tasks 2 and 3 are one task. The isolation test needs both the schema and the scoped session, so neither is independently testable. |
| 3 | asyncpg refuses multiple commands in one prepared statement. Every migration issues one statement per `op.execute`. |
| 4 | A Postgres superuser bypasses RLS even with `FORCE`. The application connects as `demoloop_app`, which has neither `rolsuper` nor `rolbypassrls`; testing isolation as the owner would have proven nothing. |
| 5 | Async sessions need `expire_on_commit=False`, or reading an attribute after the transaction closes raises `DetachedInstanceError`. |
| 6 | With cached engines, pytest-asyncio needs `asyncio_default_fixture_loop_scope` and `asyncio_default_test_loop_scope` set to `session`, or the second test hits a closed event loop. |
| 7 | The claim path cannot use an unscoped session, because RLS on `job` denies it. It uses a `demoloop_dispatch` role with a permissive policy on `job` alone — narrower than `BYPASSRLS`, which would expose every tenant table. The role is refused `product` at the grant level, which is asserted. |
| 8 | FastAPI cannot derive a response model from `dict | Response`; the lease route declares `response_model=None`. |
| 9 | Tests that touch the database use `httpx.AsyncClient` over ASGI rather than `TestClient`, so the app and the cached engines share one event loop. |

Three database roles exist, not two: `demoloop_app` (row-level security applies),
`demoloop_dispatch` (cross-workspace on `job` only), and the owner (migrations). The admin
console's audited bypass in the architecture is a fourth and is not yet built.

`service/docker-compose.yml` starts the Postgres these tests require.

## Vertical slice closed 2026-08-05

The runner now executes real captures rather than a test stub, and the boundary is proven
across both languages by `service/packages/apps/demoloop-api/tests/test_capture_end_to_end.py`.

That test starts the fixture application and the API, enqueues a capture job in Postgres,
runs the Node runner as a subprocess, and asserts the finished report in the database. One
observed run: `mode=record`, `passed=true`, artifacts `raw-create`, `screenshot-create`,
`text-create`, `timeline`, `report`, and provenance naming the actual HEAD with `dirty: true`.
The screencast and page-text artifacts exist only in record mode, so the assertion is evidence
of a real capture rather than a mocked one.

Two additions the slice forced:

- `runOnce` holds the lease with a heartbeat while capture runs. A real capture outlives the
  sixty-second lease, so without it the job would be silently reclaimed mid-flight and run twice.
- `capture` performs rehearse twice then record inside one job, so the rehearsal receipt never
  leaves the runner. This is the atomicity the architecture requires, now implemented.

Still stubbed: artifacts stay on the runner's local disk. The `withheld` outcome currently
reports a refusal rather than preventing an upload, because there is no upload yet. Plan 2
closes that.

## Production pipeline landed 2026-08-05

`capture → render → evaluate` runs end to end through the real stack, proven by
`test_production_pipeline.py`: a production is started, three workers are run, and the assertions
read the database and object storage rather than the workers' own output.

One observed run: production `complete`, a 24,596-byte master stored under the workspace prefix,
and the quality report reading `pending-agent-review` — the engine's rule that nothing publishes
without an agent watching it, surfacing correctly through the service.

Design points settled while building it:

- Artifacts accumulate across stages rather than being replaced. Evaluate needs the capture's
  timeline and execution report alongside the render's video, so each stage's result is merged
  over the payload it received.
- Render publishes `presentation-metadata` as an artifact. Without it, evaluate's editorial
  checks measure nothing and a good video fails product-dominance.
- One binary, stages selected by job kind, kinds selected by configuration.

Not yet built: the agent editorial review that moves a production past `pending-agent-review`,
and retention.

## Reconnaissance flow landed 2026-08-05

`discover → plan` runs through the real stack, proven by `test_reconnaissance_end_to_end.py`
against the neutral fixture: the model is confirmed against the running product, runtime evidence
is recorded, and a scenario is planned. One observed run reached `complete` with
`product = "Delivery Board"` and a `planned` result.

Two properties worth keeping:

- Discovery's evidence never carries runner-local paths into the stored model. Screenshots and
  accessibility snapshots are rewritten to artifact names before the model leaves the runner, so
  the Product Map references artifacts rather than a filesystem that no longer exists.
- Planning that cannot be supported by evidence returns `needs-authoring`, and the flow records
  that status rather than inventing a scenario. The engine's honesty rule survives the service.

Five job kinds now exist — discover, plan, capture, render, evaluate — dispatched from one
binary by `DEMOLOOP_KINDS`.

## Customer journey closed 2026-08-05

`test_customer_journey.py` drives the whole product loop through the public API: start
reconnaissance, run discover and plan, read the Product Map back, start a production from the
planned scenario, run capture, render and evaluate, then fetch the video. One observed run
captured five scenes across two actors and returned an 79,797-byte master through a signed URL,
with the quality report at `pending-agent-review`.

**It found a real engine bug.** In `full` mode the planner stripped every `goto` from the public
master, on the reasoning that the opening hook had already navigated. That holds only for the
hook's own actor: `runner.ts` gives each actor its own browser context, which starts at
`about:blank`, so any scene that begins with a click for a second actor could never resolve its
target. Every two-actor full-scope master was unproduceable — and full scope is the PRD's
headline output. The planner now drops navigation only for an actor whose page has already been
sent somewhere.

The engine's own suite could not have caught it: its multi-actor fixture gives the second actor
no navigating safe action, so nothing was there to strip. It took an end-to-end run against a
real application to surface it.

## Drift detection landed 2026-08-05

PRD §5.7 in its mechanical form: `verify` re-resolves every target of a produced demo against the
current product and records health. Proven end to end by `test_drift_end_to_end.py` — a demo is
`fresh` against the product it was recorded from, and a renamed control comes back `drifted`
naming the scene and the label that moved.

The PRD's three outcomes are distinguished by what the finding says, not by guesswork:

| Finding | Health | Why |
|---|---|---|
| every target resolved | `fresh` | nothing to do |
| only ambiguous targets | `repairable` | the element still exists, so the Product Map can re-resolve it |
| anything missing | `drifted` | the capability may have changed materially; a human decides |

One trap avoided: a verify job must not hang off `production_id`. `advance` treats an unknown
kind as terminal, so a verification would have marked the production it was merely inspecting as
complete. Verifications carry their own foreign key and their own branch, and a test asserts that
verifying leaves the production's status untouched.
