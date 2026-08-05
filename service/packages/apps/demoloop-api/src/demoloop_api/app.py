from fastapi import FastAPI

from demoloop_core.settings import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Demoloop")

    @app.get("/v1/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings().env}

    return app
