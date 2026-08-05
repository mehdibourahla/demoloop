from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DEMOLOOP_", env_file=".env", extra="ignore")

    env: str = "test"
    database_url: str = "postgresql+asyncpg://demoloop_app:demoloop_app@127.0.0.1:5432/demoloop"
    admin_database_url: str = "postgresql+asyncpg://demoloop:demoloop@127.0.0.1:5432/demoloop"
    dispatch_database_url: str = "postgresql+asyncpg://demoloop_dispatch:demoloop_dispatch@127.0.0.1:5432/demoloop"
    runner_shared_secret: str = "development-only"


@lru_cache
def settings() -> Settings:
    return Settings()
