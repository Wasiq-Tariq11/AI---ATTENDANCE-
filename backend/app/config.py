from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "change-me-later"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI Attendance System"
    environment: str = "development"
    cors_origins: str = "http://localhost:5173"
    database_url: str = ""
    secret_key: str = DEFAULT_SECRET
    access_token_minutes: int = 60
    login_max_failures: int = 5
    login_window_seconds: int = 900
    face_encryption_key: str = ""
    timezone: str = "Asia/Kolkata"
    face_match_threshold: float = 0.50
    face_margin: float = 0.04
    staff_match_threshold: float = 0.45      # stricter than students: teachers' own identity
    staff_min_minutes: int = 5               # minimum time between check-in and check-out
    campus_networks: str = ""                # e.g. "203.0.113.0/24,10.0.0.0/8"; empty = not enforced
    require_staff_checkin: bool = False      # if True, a class cannot start before the teacher checked in

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

if settings.environment == "production" and (
    settings.secret_key == DEFAULT_SECRET or len(settings.secret_key) < 32
):
    raise RuntimeError("Set a strong SECRET_KEY (32+ chars) in production.")
if settings.environment == "production" and len(settings.face_encryption_key) < 32:
    raise RuntimeError("Set FACE_ENCRYPTION_KEY (32+ chars) in production.")
