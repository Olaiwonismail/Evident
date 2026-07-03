from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str

    @field_validator("database_url")
    @classmethod
    def _use_asyncpg_driver(cls, v: str) -> str:
        # Render/Heroku/Aiven hand out postgres:// or postgresql:// URLs; async SQLAlchemy needs the asyncpg driver
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg rejects libpq's sslmode= query param; its equivalent is ssl=
        if "+asyncpg" in v and "sslmode=" in v:
            v = v.replace("sslmode=", "ssl=")
        return v
    nomba_base_url: str = "https://sandbox.nomba.com"
    nomba_client_id: str
    nomba_private_key: str
    nomba_account_id: str
    nomba_sub_account_id: str
    nomba_signature_key: str = ""
    app_base_url: str
    secret_key: str

    class Config:
        env_file = ".env"


settings = Settings()
