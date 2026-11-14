from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.tables import User
from ..schemas.auth import ChangePasswordRequest, LoginRequest, TokenOut, UserOut
from ..security import (DUMMY_HASH, clear_failures, create_access_token, get_current_user,
                        hash_password, is_locked, record_failure, verify_password)
from ..services.audit import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])
BAD_LOGIN = "Invalid username, password, or role"


@router.post("/login", response_model=TokenOut)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    key = f"{ip}|{body.username.lower()}"
    if is_locked(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many failed attempts. Try again in 15 minutes.")

    user = db.scalar(select(User).where(User.username == body.username))
    # Always run one hash check so timing does not reveal whether the user exists.
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not (user and ok and user.is_active and user.role == body.role):
        record_failure(key)
        log_action(db, user.id if user else None, "login_failed", "user", body.username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_LOGIN)

    clear_failures(key)
    log_action(db, user.id, "login_success", "user", user.id)
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.add(user)
    db.commit()
    log_action(db, user.id, "password_changed", "user", user.id)
    return {"message": "Password changed"}
