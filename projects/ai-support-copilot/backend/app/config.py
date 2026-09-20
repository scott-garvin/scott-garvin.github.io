import os
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_DIR = Path(
    os.environ.get("HARBOR_PROJECT_DIR", str(Path(__file__).resolve().parents[2]))
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_DIR / "backend/.env", extra="ignore"
    )
    app_mode: Literal["sample", "live"] = "sample"
    openai_api_key: str = ""
    openai_model: str = ""
    api_access_key: str = ""
    database_url: str = ""
    max_live_requests_per_day: int = Field(default=20, ge=0, le=1000)
    max_live_requests_per_month: int = Field(default=200, ge=0, le=10000)
    embedding_model: str = "text-embedding-3-small"
    tenant_id: str = "harbor-demo"
    max_requests_per_minute: int = Field(default=10, ge=1, le=100)

    @model_validator(mode="after")
    def require_live_configuration(self):
        if self.app_mode == "live":
            if not all((self.openai_api_key, self.openai_model, self.database_url)):
                raise ValueError(
                    "Live mode requires OPENAI_API_KEY, OPENAI_MODEL, and DATABASE_URL"
                )
            if len(self.api_access_key) < 24:
                raise ValueError(
                    "Live mode requires an API_ACCESS_KEY of at least 24 characters"
                )
        return self
