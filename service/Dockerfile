FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /service
COPY pyproject.toml uv.lock ./
COPY packages ./packages
RUN uv sync --frozen --no-dev

COPY migrations ./migrations
COPY alembic.ini ./

RUN useradd --create-home demoloop && chown -R demoloop /service
USER demoloop

ENV PORT=8000
CMD ["sh", "-c", "uv run uvicorn demoloop_api.app:create_app --factory --host 0.0.0.0 --port ${PORT}"]
