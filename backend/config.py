from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "Verken Orders Dashboard"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = True
    port: int = 8000

    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Falabella
    falabella_user_id: str
    falabella_api_key: str
    falabella_base_url: str = "https://sellercenter-api.falabella.com"

    # Mercado Libre
    mercadolibre_client_id: str = ""
    mercadolibre_client_secret: str = ""
    mercadolibre_refresh_token: str = ""   # Long-lived token to auto-renovate access_token
    mercadolibre_access_token: str = ""    # OAuth access token (obtained via ml_oauth.py)
    mercadolibre_seller_id: str = ""       # Numeric seller ID from ML

    # Email / Resend
    resend_api_key: str
    email_from: str = "Verken Orders <reports@verken.cl>"
    email_recipients: str  # comma-separated

    # Scheduler
    daily_sync_hour: int = 7
    daily_sync_minute: int = 0
    scheduler_timezone: str = "America/Santiago"

    # Shopify — one entry per store
    shopify_verken_url: str = ""      # e.g. "verken.myshopify.com"
    shopify_verken_token: str = ""    # Admin API token (scope: read_orders)
    shopify_kaut_url: str = ""        # e.g. "kaut.myshopify.com"
    shopify_kaut_token: str = ""      # Admin API token (scope: read_orders)

    # CORS
    allowed_origins: str = "http://localhost:3000"

    @property
    def email_recipients_list(self) -> list[str]:
        return [e.strip() for e in self.email_recipients.split(",") if e.strip()]

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
