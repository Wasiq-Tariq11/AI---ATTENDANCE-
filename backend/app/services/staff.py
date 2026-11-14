import ipaddress
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models.tables import StaffAttendance, StaffFaceTemplate, Teacher, User
from . import face
from .audit import log_action


def as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def iso(dt):
    """ISO string that always carries a timezone (SQLite returns naive UTC values)."""
    return as_utc(dt).isoformat() if dt else None


def local_hm(dt) -> str:
    return as_utc(dt).astimezone(ZoneInfo(settings.timezone)).strftime("%H:%M") if dt else ""


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce_campus(request: Request) -> None:
    """If CAMPUS_NETWORKS is set, check-in/out is only accepted from those networks."""
    nets = [n.strip() for n in settings.campus_networks.split(",") if n.strip()]
    if not nets:
        return
    try:
        ip = ipaddress.ip_address(client_ip(request))
        ok = any(ip in ipaddress.ip_network(n, strict=False) for n in nets)
    except ValueError:
        ok = False
    if not ok:
        raise HTTPException(403, "Check-in and check-out are only allowed from the campus network")


def staff_out(r: StaffAttendance) -> dict:
    hours = round((as_utc(r.check_out_at) - as_utc(r.check_in_at)).total_seconds() / 3600, 2) if r.check_out_at else None
    return {"id": r.id, "teacher_id": r.teacher_id, "date": r.work_date.isoformat(),
            "check_in_at": iso(r.check_in_at), "check_out_at": iso(r.check_out_at), "hours": hours,
            "in_method": r.check_in_method, "out_method": r.check_out_method,
            "in_confidence": r.check_in_confidence, "out_confidence": r.check_out_confidence,
            "in_ip": r.check_in_ip, "out_ip": r.check_out_ip, "status": "complete" if r.check_out_at else "in"}


def verify_teacher_face(db: Session, teacher: Teacher, user: User, raw_embedding):
    """1:1 + 1:N check. The face must belong to THIS teacher and to nobody else.
    Returns (status, confidence) with status in ok | not_registered | invalid | mismatch."""
    if not db.scalar(select(func.count()).select_from(StaffFaceTemplate).where(StaffFaceTemplate.teacher_id == teacher.id)):
        return "not_registered", None
    try:
        emb = face.validate(raw_embedding)
    except ValueError:
        return "invalid", None
    ranked = face.ranked_staff(db, emb)
    best_id, best_d = ranked[0]
    if best_d > settings.staff_match_threshold:
        return "mismatch", None
    if len(ranked) > 1 and ranked[1][1] - best_d < settings.face_margin:
        return "mismatch", None
    if best_id != teacher.id:  # a colleague's face on this account = proxy attempt
        log_action(db, user.id, "staff_proxy_suspected", "teacher", teacher.id, f"face matched a different teacher (id {best_id})")
        return "mismatch", None
    return "ok", face.confidence(best_d)
