from demoloop_core.settings import settings
from fastapi import FastAPI

from demoloop_api.admin import mount_admin
from demoloop_api.routers import public, runner, studio


def create_app() -> FastAPI:
    app = FastAPI(title="Demoloop")

    @app.get("/v1/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings().env}

    app.include_router(runner.router)
    app.include_router(studio.router)
    app.include_router(public.router)
    mount_admin(app)
    return app
