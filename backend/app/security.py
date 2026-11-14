import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models.tables import User

_ph = PasswordHasher()
# Used so a wrong username takes the same time as a wrong password.
DUMMY_HASH = _ph.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp},
                      settings.secret_key, algorithm="HS256")


# ---- simple login rate limiter (in memory; resets when the server restarts) ----
_failures: dict[str, list[float]] = defaultdict(list)


def _recent(key: str) -> list[float]:
    cutoff = time.time() - settings.login_window_seconds
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    return _failures[key]


def is_locked(key: str) -> bool:
    return len(_recent(key)) >= settings.login_max_failures


def record_failure(key: str) -> None:
    _recent(key).append(time.time())


def clear_failures(key: str) -> None:
    _failures.pop(key, None)


# ---- current-user dependencies ----
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    err = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    if creds is None:
        raise err
    try:
        payload = jwt.decode(creds.credentials, settings.secret_key, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise err
    # Role and active status always come from the database, not the token.
    if user is None or not user.is_active:
        raise err
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission for this action")
        return user
    return checker
