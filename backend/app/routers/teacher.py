from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.tables import *  # noqa
from ..config import settings
from ..models.tables import today, utcnow
from ..security import require_roles
from ..services import face, reports
from ..services.audit import log_action
from ..services.staff import verify_teacher_face
from .common import DB, commit, export

Teach = Annotated[User, Depends(require_roles("teacher"))]
router = APIRouter(prefix="/api/teacher", tags=["teacher"], dependencies=[Depends(require_roles("teacher"))])


def _teacher(db: Session, user: User) -> Teacher:
    t = db.scalar(select(Teacher).where(Teacher.user_id == user.id))
    if not t: raise HTTPException(403, "No teacher profile")
    return t


def _assigned(db: Session, t: Teacher, class_id: int, subject_id: int | None = None) -> bool:
    q = select(TeacherAssignment.id).where(TeacherAssignment.teacher_id == t.id, TeacherAssignment.class_id == class_id)
    if subject_id: q = q.where(TeacherAssignment.subject_id == subject_id)
    return db.scalar(q) is not None


def _session(db: Session, t: Teacher, sid: int, owner_open=False) -> AttendanceSession:
    s = db.get(AttendanceSession, sid)
    if not s or not _assigned(db, t, s.class_id, s.subject_id): raise HTTPException(404, "Session not found")
    if owner_open and (s.teacher_id != t.id or s.status != "open"): raise HTTPException(409, "Session is closed or belongs to another teacher")
    return s


def _roster(db: Session, s: AttendanceSession):
    studs = db.execute(select(Student.id, Student.roll_number, User.full_name).join(User, User.id == Student.user_id)
                       .join(Enrollment, Enrollment.student_id == Student.id)
                       .where(Enrollment.class_id == s.class_id, User.is_active).order_by(Student.roll_number)).all()
    recs = {r.student_id: r for r in db.scalars(select(AttendanceRecord).where(AttendanceRecord.session_id == s.id))}
    out = [{"student_id": i, "roll": roll, "name": n, "status": recs[i].status if i in recs else None,
            "method": recs[i].method if i in recs else None, "record_id": recs[i].id if i in recs else None,
            "confidence": recs[i].confidence if i in recs else None} for i, roll, n in studs]
    cls, sub = db.get(SchoolClass, s.class_id), db.get(Subject, s.subject_id)
    return {"session": {"id": s.id, "class_id": s.class_id, "class_name": cls.name, "subject_name": sub.name,
                        "date": s.session_date.isoformat(), "status": s.status},
            "students": out,
            "counts": {"present": sum(1 for x in out if x["status"] == "present"),
                       "absent": sum(1 for x in out if x["status"] == "absent"),
                       "unmarked": sum(1 for x in out if x["status"] is None), "total": len(out)}}


@router.get("/dashboard")
def dashboard(db: DB, user: Teach):
    t = _teacher(db, user)
    asg = [{"id": a, "class_id": ci, "class_name": c, "subject_id": si, "subject_name": s,
            "students": db.scalar(select(func.count(Enrollment.id)).where(Enrollment.class_id == ci)) or 0}
           for a, ci, c, si, s in db.execute(select(TeacherAssignment.id, SchoolClass.id, SchoolClass.name, Subject.id, Subject.name)
                                             .join(SchoolClass, SchoolClass.id == TeacherAssignment.class_id)
                                             .join(Subject, Subject.id == TeacherAssignment.subject_id)
                                             .where(TeacherAssignment.teacher_id == t.id).order_by(SchoolClass.name))]
    recent = []
    for s in db.scalars(select(AttendanceSession).where(AttendanceSession.teacher_id == t.id).order_by(AttendanceSession.id.desc()).limit(8)):
        r = _roster(db, s); recent.append({**r["session"], **r["counts"]})
    today_rows = db.execute(select(AttendanceRecord.status, func.count()).join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
                            .where(AttendanceSession.teacher_id == t.id, AttendanceSession.session_date == today()).group_by(AttendanceRecord.status)).all()
    td = dict(today_rows)
    rows = reports.query_rows(db, teacher_id=t.id, limit=5000)
    per: dict = {}
    for r in rows:
        k = f"{r['class_name']} · {r['subject_name']}"; a = per.setdefault(k, [0, 0]); a[0 if r["status"] == "present" else 1] += 1
    return {"profile": {"name": user.full_name, "username": user.username, "department": t.department},
            "assignments": asg, "recent_sessions": recent,
            "today": {"present": td.get("present", 0), "absent": td.get("absent", 0)},
            "class_stats": [{"name": k, "percentage": round(100 * v[0] / (v[0] + v[1]), 1)} for k, v in per.items()]}


class StartIn(BaseModel):
    class_id: int
    subject_id: int
    embedding: list[float] | None = Field(default=None, min_length=128, max_length=128)
    manual_reason: str | None = Field(default=None, min_length=5, max_length=300)


def _same_day_session(db, t, body):
    return db.scalar(select(AttendanceSession).where(AttendanceSession.teacher_id == t.id, AttendanceSession.class_id == body.class_id,
                                                     AttendanceSession.subject_id == body.subject_id, AttendanceSession.session_date == today()))


@router.post("/sessions")
def start_session(body: StartIn, db: DB, user: Teach):
    """A NEW class session needs proof the assigned teacher is present: their own face (1:1 + 1:N proxy check),
    or a manual reason (flagged for the admin). Resuming today's session needs nothing more."""
    t = _teacher(db, user)
    if not _assigned(db, t, body.class_id, body.subject_id): raise HTTPException(403, "You are not assigned to this class and subject")
    s = _same_day_session(db, t, body)
    if s:  # at most ONE session per teacher/class/subject/day (database unique constraint): reopen instead of duplicating
        if s.status == "closed":
            s.status, s.ended_at = "open", None; commit(db); log_action(db, user.id, "session_reopened", "attendance_session", s.id)
        return {"result": "started", "id": s.id, "resumed": True}
    if settings.require_staff_checkin and not db.scalar(select(StaffAttendance.id).where(StaffAttendance.teacher_id == t.id, StaffAttendance.work_date == today())):
        raise HTTPException(403, "Check in at the institute (Check in / out) before starting a class")
    if body.embedding is None and not body.manual_reason:
        return {"result": "verification_required"}
    method, conf = "manual", None
    if body.embedding is not None:
        st, conf = verify_teacher_face(db, t, user, body.embedding)
        if st != "ok":
            log_action(db, user.id, "class_start_face_rejected", "teacher", t.id, st); return {"result": "rejected", "reason": st}
        method = "face"
    s = AttendanceSession(teacher_id=t.id, class_id=body.class_id, subject_id=body.subject_id)
    try:
        db.add(s); db.flush()
        db.add(TeacherClassCheck(session_id=s.id, teacher_id=t.id, method=method, confidence=conf, manual_reason=body.manual_reason if method == "manual" else None))
        db.commit()
    except IntegrityError:
        db.rollback(); s = _same_day_session(db, t, body); return {"result": "started", "id": s.id, "resumed": True}
    log_action(db, user.id, "session_started", "attendance_session", s.id, f"teacher verified by {method}" + (f": {body.manual_reason}" if method == "manual" else ""))
    return {"result": "started", "id": s.id, "method": method}


@router.get("/sessions")
def sessions(db: DB, user: Teach, class_id: int | None = None):
    t = _teacher(db, user)
    st = select(AttendanceSession).join(TeacherAssignment, (TeacherAssignment.class_id == AttendanceSession.class_id) & (TeacherAssignment.subject_id == AttendanceSession.subject_id)).where(TeacherAssignment.teacher_id == t.id).order_by(AttendanceSession.id.desc()).limit(60)
    if class_id: st = st.where(AttendanceSession.class_id == class_id)
    out = []
    for s in db.scalars(st): r = _roster(db, s); out.append({**r["session"], **r["counts"]})
    return out


@router.get("/sessions/{sid}")
def session_detail(sid: int, db: DB, user: Teach):
    return _roster(db, _session(db, _teacher(db, user), sid))


class MatchIn(BaseModel):
    embedding: list[float] = Field(min_length=128, max_length=128)


@router.post("/sessions/{sid}/face-match")
def face_match(sid: int, body: MatchIn, db: DB, user: Teach):
    s = _session(db, _teacher(db, user), sid, owner_open=True)
    try: emb = face.validate(body.embedding)
    except ValueError: raise HTTPException(400, "Invalid face data")
    stud, dist, result = face.decide(face.ranked_matches(db, emb, class_id=s.class_id))
    if result != "ok":  # never reveal who the closest person was
        return {"result": result}
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.session_id == sid, AttendanceRecord.student_id == stud))
    info = db.execute(select(Student.roll_number, User.full_name).join(User, User.id == Student.user_id).where(Student.id == stud)).one()
    conf = face.confidence(dist)
    if rec and rec.status == "present":
        return {"result": "already", "student": {"id": stud, "roll": info[0], "name": info[1]}, "confidence": conf}
    if rec: rec.status, rec.method, rec.confidence, rec.marked_by, rec.marked_at = "present", "face", conf, user.id, utcnow()
    else: db.add(AttendanceRecord(session_id=sid, student_id=stud, status="present", method="face", confidence=conf, marked_by=user.id))
    commit(db)  # unique constraint blocks a duplicate even if two requests race
    return {"result": "marked", "student": {"id": stud, "roll": info[0], "name": info[1]}, "confidence": conf}


class MarkIn(BaseModel):
    student_id: int
    status: str = Field(pattern="^(present|absent)$")
    reason: str = Field(min_length=3, max_length=300)


@router.post("/sessions/{sid}/mark")
def mark(sid: int, body: MarkIn, db: DB, user: Teach):
    s = _session(db, _teacher(db, user), sid)
    if not db.scalar(select(Enrollment.id).where(Enrollment.student_id == body.student_id, Enrollment.class_id == s.class_id)):
        raise HTTPException(400, "Student is not enrolled in this class")
    rec = db.scalar(select(AttendanceRecord).where(AttendanceRecord.session_id == sid, AttendanceRecord.student_id == body.student_id))
    old = rec.status if rec else "none"
    if rec: rec.status, rec.method, rec.confidence, rec.marked_by, rec.marked_at = body.status, "manual", None, user.id, utcnow()
    else: db.add(AttendanceRecord(session_id=sid, student_id=body.student_id, status=body.status, method="manual", marked_by=user.id))
    commit(db)
    log_action(db, user.id, "attendance_manual", "attendance_session", sid, f"student {body.student_id}: {old} -> {body.status}. Reason: {body.reason}")
    return {"ok": True}


@router.post("/sessions/{sid}/close")
def close(sid: int, db: DB, user: Teach):
    s = _session(db, _teacher(db, user), sid, owner_open=True)
    for row in _roster(db, s)["students"]:
        if row["status"] is None: db.add(AttendanceRecord(session_id=sid, student_id=row["student_id"], status="absent", method="manual", marked_by=user.id))
    s.status, s.ended_at = "closed", utcnow(); commit(db)
    log_action(db, user.id, "session_closed", "attendance_session", sid)
    r = _roster(db, s); return {**r["counts"], "id": sid}


@router.get("/students")
def students(db: DB, user: Teach, class_id: int, subject_id: int | None = None, q: str = ""):
    t = _teacher(db, user)
    if not _assigned(db, t, class_id): raise HTTPException(403, "Not your class")
    studs = db.execute(select(Student.id, Student.roll_number, User.full_name).join(User, User.id == Student.user_id)
                       .join(Enrollment, Enrollment.student_id == Student.id).where(Enrollment.class_id == class_id).order_by(Student.roll_number)).all()
    st = (select(AttendanceRecord.student_id, AttendanceRecord.status, func.count()).join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
          .where(AttendanceSession.class_id == class_id, AttendanceSession.status == "closed").group_by(AttendanceRecord.student_id, AttendanceRecord.status))
    if subject_id: st = st.where(AttendanceSession.subject_id == subject_id)
    agg: dict = {}
    for sid, s, c in db.execute(st): agg.setdefault(sid, {})[s] = c
    ql = q.lower(); out = []
    for i, roll, n in studs:
        if ql and ql not in n.lower() and ql not in roll.lower(): continue
        p, a = agg.get(i, {}).get("present", 0), agg.get(i, {}).get("absent", 0)
        out.append({"id": i, "roll": roll, "name": n, "present": p, "absent": a, "percentage": round(100 * p / (p + a), 1) if p + a else None})
    return out


@router.get("/report")
def report(db: DB, user: Teach, class_id: int, subject_id: int | None = None, fmt: str = Query("csv", pattern="^(csv|pdf)$"),
           date_from: date | None = None, date_to: date | None = None):
    t = _teacher(db, user)
    if not _assigned(db, t, class_id, subject_id): raise HTTPException(403, "Not your class")
    rows = reports.query_rows(db, class_id=class_id, subject_id=subject_id, date_from=date_from, date_to=date_to)
    return export(rows, fmt, "class-attendance", "Class Attendance Report")
