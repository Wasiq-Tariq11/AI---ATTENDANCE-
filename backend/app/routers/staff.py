import math
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..models.tables import StaffAttendance, StaffFaceTemplate, Teacher, User
from ..models.tables import today, utcnow
from ..security import require_roles
from ..services.audit import log_action
from ..services.staff import as_utc, client_ip, enforce_campus, staff_out, verify_teacher_face
from .common import DB

Teach = Annotated[User, Depends(require_roles("teacher"))]
router = APIRouter(prefix="/api/teacher/presence", tags=["staff-attendance"], dependencies=[Depends(require_roles("teacher"))])


def _me(db, user) -> Teacher:
    t = db.scalar(select(Teacher).where(Teacher.user_id == user.id))
    if not t: raise HTTPException(403, "No teacher profile")
    return t


def _row(db, tid, d):
    return db.scalar(select(StaffAttendance).where(StaffAttendance.teacher_id == tid, StaffAttendance.work_date == d))


class FaceIn(BaseModel):
    embedding: list[float] = Field(min_length=128, max_length=128)


@router.get("/today")
def status_today(db: DB, user: Teach):
    t = _me(db, user); r = _row(db, t.id, today())
    faces = db.scalar(select(func.count()).select_from(StaffFaceTemplate).where(StaffFaceTemplate.teacher_id == t.id)) or 0
    return {"date": today().isoformat(), "record": staff_out(r) if r else None, "face_registered": faces > 0,
            "campus_restricted": bool(settings.campus_networks.strip()), "min_minutes": settings.staff_min_minutes}


@router.get("/history")
def history(db: DB, user: Teach, days: int = Query(30, ge=1, le=120)):
    t = _me(db, user)
    rows = db.scalars(select(StaffAttendance).where(StaffAttendance.teacher_id == t.id, StaffAttendance.work_date >= today() - timedelta(days=days))
                      .order_by(StaffAttendance.work_date.desc()))
    return [staff_out(r) for r in rows]


def _rejected(reason):
    return {"result": "rejected", "reason": reason}


@router.post("/check-in")
def check_in(body: FaceIn, request: Request, db: DB, user: Teach):
    t = _me(db, user); enforce_campus(request); d = today()
    existing = _row(db, t.id, d)
    if existing:
        log_action(db, user.id, "staff_checkin_duplicate_blocked", "teacher", t.id, d.isoformat())
        return {"result": "already", "record": staff_out(existing)}
    st, conf = verify_teacher_face(db, t, user, body.embedding)
    if st != "ok":
        log_action(db, user.id, "staff_checkin_face_rejected", "teacher", t.id, st); return _rejected(st)
    rec = StaffAttendance(teacher_id=t.id, work_date=d, check_in_at=utcnow(), check_in_method="face", check_in_confidence=conf,
                          check_in_ip=client_ip(request), check_in_by=user.id)
    db.add(rec)
    try:
        db.commit()
    except IntegrityError:  # two requests raced: the database unique constraint lets only one win
        db.rollback(); return {"result": "already", "record": staff_out(_row(db, t.id, d))}
    log_action(db, user.id, "staff_check_in", "teacher", t.id, f"face {round((conf or 0) * 100)}%")
    return {"result": "checked_in", "record": staff_out(rec)}


@router.post("/check-out")
def check_out(body: FaceIn, request: Request, db: DB, user: Teach):
    t = _me(db, user); enforce_campus(request); d = today()
    rec = _row(db, t.id, d)
    if not rec: return {"result": "no_check_in"}
    if rec.check_out_at:
        log_action(db, user.id, "staff_checkout_duplicate_blocked", "teacher", t.id, d.isoformat())
        return {"result": "already", "record": staff_out(rec)}
    mins = (utcnow() - as_utc(rec.check_in_at)).total_seconds() / 60
    if mins < settings.staff_min_minutes:
        return {"result": "too_soon", "wait_minutes": max(1, math.ceil(settings.staff_min_minutes - mins))}
    st, conf = verify_teacher_face(db, t, user, body.embedding)
    if st != "ok":
        log_action(db, user.id, "staff_checkout_face_rejected", "teacher", t.id, st); return _rejected(st)
    res = db.execute(update(StaffAttendance).where(StaffAttendance.id == rec.id, StaffAttendance.check_out_at.is_(None))
                     .values(check_out_at=utcnow(), check_out_method="face", check_out_confidence=conf, check_out_ip=client_ip(request), check_out_by=user.id))
    db.commit()
    rec = _row(db, t.id, d); db.refresh(rec)
    if res.rowcount == 0:  # someone else already wrote the check-out
        return {"result": "already", "record": staff_out(rec)}
    log_action(db, user.id, "staff_check_out", "teacher", t.id, f"face {round((conf or 0) * 100)}%")
    return {"result": "checked_out", "record": staff_out(rec)}
