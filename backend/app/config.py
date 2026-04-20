from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str = "recruitment"
    postgres_user: str = "recruitment"
    postgres_password: str = "recruitment"

    redis_url: str = "redis://redis:6379/0"

    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "minio"
    s3_secret_key: str = "miniopassword"
    s3_bucket: str = "recruitment-files"
    s3_region: str = "us-east-1"
    s3_secure: bool = False

    polza_base_url: str = "https://polza.ai/api/v1"
    polza_api_key: str = ""
    polza_model: str = "gpt-4o-mini"
    api_root_path: str = ""

    jwt_secret: str = "change-me"
    jwt_expire_minutes: int = 720

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
