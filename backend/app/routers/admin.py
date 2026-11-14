from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..models.tables import *  # noqa
from ..config import settings
from ..models.tables import today, utcnow
from ..security import hash_password, require_roles
from ..services import face, reports
from ..services.audit import log_action
from ..services.staff import as_utc, iso, local_hm, staff_out
from .common import DB, commit, export, export_table, flush_or_409, temp_password

Admin = Annotated[User, Depends(require_roles("admin"))]
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])


@router.get("/ping")
def ping(user: Admin):
    return {"message": f"Hello admin {user.full_name}"}


# ---------------- dashboard ----------------
@router.get("/stats")
def stats(db: DB):
    n = lambda q: db.scalar(q) or 0  # noqa
    t = today()
    cnt = lambda role: n(select(func.count(User.id)).where(User.role == role, User.is_active))  # noqa
    base = (select(AttendanceSession.session_date, AttendanceRecord.status, func.count())
            .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
            .where(AttendanceSession.status == "closed"))
    start = t - timedelta(days=13)
    by_day: dict = {}
    for d, s, c in db.execute(base.where(AttendanceSession.session_date >= start)
                              .group_by(AttendanceSession.session_date, AttendanceRecord.status)):
        by_day.setdefault(d, {"present": 0, "absent": 0})[s] = c
    trend = []
    for i in range(14):
        d = start + timedelta(days=i); v = by_day.get(d, {"present": 0, "absent": 0}); tot = v["present"] + v["absent"]
        trend.append({"date": d.strftime("%d %b"), "present": v["present"], "absent": v["absent"],
                      "percentage": round(100 * v["present"] / tot, 1) if tot else None})
    tv = by_day.get(t, {"present": 0, "absent": 0})
    allp = n(select(func.count()).select_from(AttendanceRecord).join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
             .where(AttendanceSession.status == "closed", AttendanceRecord.status == "present"))
    allt = n(select(func.count()).select_from(AttendanceRecord).join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
             .where(AttendanceSession.status == "closed"))
    per_class = []
    for name, s, c in db.execute(select(SchoolClass.name, AttendanceRecord.status, func.count())
                                 .join(AttendanceSession, AttendanceSession.class_id == SchoolClass.id)
                                 .join(AttendanceRecord, AttendanceRecord.session_id == AttendanceSession.id)
                                 .where(AttendanceSession.status == "closed").group_by(SchoolClass.name, AttendanceRecord.status)):
        per_class.append((name, s, c))
    agg: dict = {}
    for name, s, c in per_class:
        a = agg.setdefault(name, [0, 0]); a[0 if s == "present" else 1] += c
    recent = db.execute(select(AuditLog.action, AuditLog.details, AuditLog.created_at, User.full_name)
                        .outerjoin(User, User.id == AuditLog.actor_user_id)
                        .where(AuditLog.action.not_in(["login_failed"])).order_by(AuditLog.id.desc()).limit(8)).all()
    return {
        "students": cnt("student"), "teachers": cnt("teacher"),
        "classes": n(select(func.count(SchoolClass.id)).where(SchoolClass.is_active)),
        "subjects": n(select(func.count(Subject.id)).where(Subject.is_active)),
        "today": {"present": tv["present"], "absent": tv["absent"]},
        "staff_in_today": n(select(func.count(StaffAttendance.id)).where(StaffAttendance.work_date == t)),
        "overall_percentage": round(100 * allp / allt, 1) if allt else 0,
        "trend": trend,
        "per_class": [{"name": k, "percentage": round(100 * v[0] / (v[0] + v[1]), 1)} for k, v in agg.items()],
        "recent": [{"action": a, "details": d, "at": iso(c), "actor": u} for a, d, c, u in recent],
    }


# ---------------- classes / subjects / academic sessions ----------------
class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    academic_session_id: int | None = None
    is_active: bool = True


class SubjectIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=120)
    is_active: bool = True


class SessionIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    start_date: date
    end_date: date


@router.get("/classes")
def classes(db: DB):
    out = []
    for c in db.scalars(select(SchoolClass).order_by(SchoolClass.name)):
        subs = db.execute(select(Subject.id, Subject.name).join(ClassSubject, ClassSubject.subject_id == Subject.id)
                          .where(ClassSubject.class_id == c.id)).all()
        out.append({"id": c.id, "name": c.name, "is_active": c.is_active, "academic_session_id": c.academic_session_id,
                    "students": db.scalar(select(func.count(Enrollment.id)).where(Enrollment.class_id == c.id)) or 0,
                    "subjects": [{"id": i, "name": n} for i, n in subs]})
    return out


@router.post("/classes", status_code=201)
def class_create(body: ClassIn, db: DB, admin: Admin):
    c = SchoolClass(**body.model_dump()); db.add(c); commit(db)
    log_action(db, admin.id, "class_created", "class", c.id, c.name); return {"id": c.id}


@router.put("/classes/{cid}")
def class_update(cid: int, body: ClassIn, db: DB, admin: Admin):
    c = db.get(SchoolClass, cid) or _nf()
    for k, v in body.model_dump().items(): setattr(c, k, v)
    commit(db); log_action(db, admin.id, "class_updated", "class", cid, c.name); return {"ok": True}


@router.delete("/classes/{cid}")
def class_delete(cid: int, db: DB, admin: Admin):
    c = db.get(SchoolClass, cid) or _nf()
    db.execute(delete(ClassSubject).where(ClassSubject.class_id == cid))
    db.execute(delete(Enrollment).where(Enrollment.class_id == cid))
    db.delete(c); commit(db, "Class has attendance or teacher assignments. Deactivate it instead.")
    log_action(db, admin.id, "class_deleted", "class", cid); return {"ok": True}


class SubjectIds(BaseModel):
    subject_ids: list[int]


@router.put("/classes/{cid}/subjects")
def class_subjects(cid: int, body: SubjectIds, db: DB, admin: Admin):
    db.get(SchoolClass, cid) or _nf()
    have = {s for (s,) in db.execute(select(ClassSubject.subject_id).where(ClassSubject.class_id == cid))}
    want = set(body.subject_ids)
    for sid in have - want:
        if db.scalar(select(TeacherAssignment.id).where(TeacherAssignment.class_id == cid, TeacherAssignment.subject_id == sid)):
            raise HTTPException(400, "Remove the teacher assignment for that subject first")
    db.execute(delete(ClassSubject).where(ClassSubject.class_id == cid, ClassSubject.subject_id.in_(have - want)))
    for sid in want - have: db.add(ClassSubject(class_id=cid, subject_id=sid))
    commit(db); log_action(db, admin.id, "class_subjects_set", "class", cid, str(sorted(want))); return {"ok": True}


@router.get("/subjects")
def subjects(db: DB):
    return [{"id": s.id, "code": s.code, "name": s.name, "is_active": s.is_active}
            for s in db.scalars(select(Subject).order_by(Subject.code))]


@router.post("/subjects", status_code=201)
def subject_create(body: SubjectIn, db: DB, admin: Admin):
    s = Subject(**body.model_dump()); db.add(s); commit(db, "Subject code already exists")
    log_action(db, admin.id, "subject_created", "subject", s.id, s.name); return {"id": s.id}


@router.put("/subjects/{sid}")
def subject_update(sid: int, body: SubjectIn, db: DB, admin: Admin):
    s = db.get(Subject, sid) or _nf()
    for k, v in body.model_dump().items(): setattr(s, k, v)
    commit(db, "Subject code already exists"); log_action(db, admin.id, "subject_updated", "subject", sid); return {"ok": True}


@router.delete("/subjects/{sid}")
def subject_delete(sid: int, db: DB, admin: Admin):
    s = db.get(Subject, sid) or _nf()
    db.execute(delete(ClassSubject).where(ClassSubject.subject_id == sid))
    db.delete(s); commit(db, "Subject is used by attendance or assignments. Deactivate it instead.")
    log_action(db, admin.id, "subject_deleted", "subject", sid); return {"ok": True}


@router.get("/academic-sessions")
def acad(db: DB):
    return [{"id": a.id, "name": a.name, "start_date": a.start_date.isoformat(), "end_date": a.end_date.isoformat(),
             "is_current": a.is_current} for a in db.scalars(select(AcademicSession).order_by(AcademicSession.start_date.desc()))]


@router.post("/academic-sessions", status_code=201)
def acad_create(body: SessionIn, db: DB, admin: Admin):
    if body.end_date <= body.start_date: raise HTTPException(400, "End date must be after start date")
    a = AcademicSession(**body.model_dump()); db.add(a); commit(db, "Session name already exists")
    log_action(db, admin.id, "academic_session_created", "academic_session", a.id, a.name); return {"id": a.id}


@router.post("/academic-sessions/{aid}/make-current")
def acad_current(aid: int, db: DB, admin: Admin):
    a = db.get(AcademicSession, aid) or _nf()
    for x in db.scalars(select(AcademicSession)): x.is_current = x.id == aid
    commit(db); log_action(db, admin.id, "academic_session_current", "academic_session", aid, a.name); return {"ok": True}


# ---------------- teachers ----------------
class TeacherIn(BaseModel):
    username: str = Field(min_length=2, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    full_name: str = Field(min_length=1, max_length=120)
    department: str | None = Field(default=None, max_length=80)
    is_active: bool = True


@router.get("/teachers")
def teachers(db: DB, q: str = ""):
    st = select(Teacher, User).join(User, User.id == Teacher.user_id).order_by(User.full_name)
    if q: st = st.where(User.full_name.ilike(f"%{q}%") | User.username.ilike(f"%{q}%"))
    return [{"id": t.id, "user_id": u.id, "username": u.username, "full_name": u.full_name, "department": t.department,
             "is_active": u.is_active,
             "assignments": db.scalar(select(func.count(TeacherAssignment.id)).where(TeacherAssignment.teacher_id == t.id)) or 0,
             "sessions": db.scalar(select(func.count(AttendanceSession.id)).where(AttendanceSession.teacher_id == t.id)) or 0,
             "face_templates": db.scalar(select(func.count(StaffFaceTemplate.id)).where(StaffFaceTemplate.teacher_id == t.id)) or 0}
            for t, u in db.execute(st)]


@router.post("/teachers", status_code=201)
def teacher_create(body: TeacherIn, db: DB, admin: Admin):
    if db.scalar(select(User.id).where(User.username == body.username)): raise HTTPException(409, "Username already exists")
    pw = temp_password()
    u = User(username=body.username, full_name=body.full_name, role="teacher", password_hash=hash_password(pw), must_change_password=True)
    db.add(u); db.flush(); t = Teacher(user_id=u.id, department=body.department); db.add(t); commit(db)
    log_action(db, admin.id, "teacher_created", "teacher", t.id, u.full_name); return {"id": t.id, "temp_password": pw}


@router.put("/teachers/{tid}")
def teacher_update(tid: int, body: TeacherIn, db: DB, admin: Admin):
    t = db.get(Teacher, tid) or _nf(); u = db.get(User, t.user_id)
    u.full_name, u.is_active, t.department = body.full_name, body.is_active, body.department
    commit(db); log_action(db, admin.id, "teacher_updated", "teacher", tid, f"active={body.is_active}"); return {"ok": True}


@router.delete("/teachers/{tid}")
def teacher_delete(tid: int, db: DB, admin: Admin):
    t = db.get(Teacher, tid) or _nf(); u = db.get(User, t.user_id)
    db.delete(t); flush_or_409(db, "Teacher has assignments or attendance history. Deactivate the account instead.")
    db.delete(u); commit(db)
    log_action(db, admin.id, "teacher_deleted", "teacher", tid); return {"ok": True}


@router.get("/teachers/{tid}/activity")
def teacher_activity(tid: int, db: DB):
    t = db.get(Teacher, tid) or _nf()
    logs = db.scalars(select(AuditLog).where(AuditLog.actor_user_id == t.user_id).order_by(AuditLog.id.desc()).limit(25))
    return [{"action": l.action, "details": l.details, "at": iso(l.created_at)} for l in logs]


@router.post("/users/{uid}/reset-password")
def reset_password(uid: int, db: DB, admin: Admin):
    u = db.get(User, uid) or _nf()
    pw = temp_password(); u.password_hash = hash_password(pw); u.must_change_password = True
    commit(db); log_action(db, admin.id, "password_reset", "user", uid, u.username); return {"temp_password": pw}


# ---------------- students ----------------
class StudentIn(BaseModel):
    roll_number: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    full_name: str = Field(min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=160)
    class_id: int | None = None
    is_active: bool = True


def _set_class(db: Session, sid: int, class_id):
    db.execute(delete(Enrollment).where(Enrollment.student_id == sid))
    if class_id:
        db.get(SchoolClass, class_id) or _nf("Class not found"); db.add(Enrollment(student_id=sid, class_id=class_id))


@router.get("/students")
def students(db: DB, q: str = "", class_id: int | None = None):
    st = (select(Student, User, SchoolClass.id, SchoolClass.name).join(User, User.id == Student.user_id)
          .outerjoin(Enrollment, Enrollment.student_id == Student.id).outerjoin(SchoolClass, SchoolClass.id == Enrollment.class_id)
          .order_by(Student.roll_number))
    if q: st = st.where(User.full_name.ilike(f"%{q}%") | Student.roll_number.ilike(f"%{q}%"))
    if class_id: st = st.where(SchoolClass.id == class_id)
    faces = dict(db.execute(select(FaceTemplate.student_id, func.count()).group_by(FaceTemplate.student_id)).all())
    return [{"id": s.id, "user_id": u.id, "roll_number": s.roll_number, "full_name": u.full_name, "email": s.email,
             "is_active": u.is_active, "class_id": cid, "class_name": cn, "face_templates": faces.get(s.id, 0)}
            for s, u, cid, cn in db.execute(st)]


@router.post("/students", status_code=201)
def student_create(body: StudentIn, db: DB, admin: Admin):
    if db.scalar(select(User.id).where(User.username == body.roll_number)): raise HTTPException(409, "Roll number already exists")
    pw = temp_password()
    u = User(username=body.roll_number, full_name=body.full_name, role="student", password_hash=hash_password(pw), must_change_password=True)
    db.add(u); db.flush(); s = Student(user_id=u.id, roll_number=body.roll_number, email=body.email); db.add(s); db.flush()
    _set_class(db, s.id, body.class_id); commit(db)
    log_action(db, admin.id, "student_created", "student", s.id, f"{u.full_name} ({s.roll_number})"); return {"id": s.id, "temp_password": pw}


@router.put("/students/{sid}")
def student_update(sid: int, body: StudentIn, db: DB, admin: Admin):
    s = db.get(Student, sid) or _nf(); u = db.get(User, s.user_id)
    u.full_name, u.is_active, s.email = body.full_name, body.is_active, body.email
    _set_class(db, sid, body.class_id); commit(db)
    log_action(db, admin.id, "student_updated", "student", sid, f"active={body.is_active}"); return {"ok": True}


@router.delete("/students/{sid}")
def student_delete(sid: int, db: DB, admin: Admin):
    s = db.get(Student, sid) or _nf(); u = db.get(User, s.user_id)
    db.execute(delete(FaceTemplate).where(FaceTemplate.student_id == sid)); db.execute(delete(Enrollment).where(Enrollment.student_id == sid))
    db.delete(s); flush_or_409(db, "Student has attendance history. Deactivate the account instead.")
    db.delete(u); commit(db)
    log_action(db, admin.id, "student_deleted", "student", sid); return {"ok": True}


class FaceIn(BaseModel):
    consent: bool
    embeddings: list[list[float]] = Field(min_length=1, max_length=5)


@router.post("/students/{sid}/face")
def face_enroll(sid: int, body: FaceIn, db: DB, admin: Admin):
    if not body.consent: raise HTTPException(400, "Written consent from the student is required")
    s = db.get(Student, sid) or _nf()
    try: embs = [face.validate(e) for e in body.embeddings]
    except ValueError: raise HTTPException(400, "Invalid face data")
    for e in embs:
        if face.is_duplicate(db, e, exclude_student=sid): raise HTTPException(409, "This face already appears to be registered to someone else")
    db.execute(delete(FaceTemplate).where(FaceTemplate.student_id == sid))
    for e in embs:
        db.add(FaceTemplate(student_id=sid, embedding_encrypted=face.encrypt(e), consent_given_at=utcnow(), consent_recorded_by=admin.id))
    commit(db); log_action(db, admin.id, "face_enrolled", "student", sid, f"{len(embs)} templates, consent recorded"); return {"templates": len(embs)}


@router.delete("/students/{sid}/face")
def face_delete(sid: int, db: DB, admin: Admin):
    db.execute(delete(FaceTemplate).where(FaceTemplate.student_id == sid)); commit(db)
    log_action(db, admin.id, "face_deleted", "student", sid); return {"ok": True}


# ---------------- teacher assignments ----------------
class AssignIn(BaseModel):
    teacher_id: int
    class_id: int
    subject_id: int


@router.get("/assignments")
def assignments(db: DB):
    TU = User
    rows = db.execute(select(TeacherAssignment.id, TU.full_name, SchoolClass.name, Subject.name, TeacherAssignment.teacher_id,
                             TeacherAssignment.class_id, TeacherAssignment.subject_id)
                      .join(Teacher, Teacher.id == TeacherAssignment.teacher_id).join(TU, TU.id == Teacher.user_id)
                      .join(SchoolClass, SchoolClass.id == TeacherAssignment.class_id)
                      .join(Subject, Subject.id == TeacherAssignment.subject_id).order_by(SchoolClass.name, Subject.name))
    return [{"id": a, "teacher": t, "class_name": c, "subject_name": s, "teacher_id": ti, "class_id": ci, "subject_id": si}
            for a, t, c, s, ti, ci, si in rows]


@router.post("/assignments", status_code=201)
def assign(body: AssignIn, db: DB, admin: Admin):
    if not db.scalar(select(ClassSubject.id).where(ClassSubject.class_id == body.class_id, ClassSubject.subject_id == body.subject_id)):
        raise HTTPException(400, "Add this subject to the class first (Academics > Classes)")
    a = TeacherAssignment(**body.model_dump()); db.add(a); commit(db, "Teacher is already assigned to this class and subject")
    log_action(db, admin.id, "teacher_assigned", "assignment", a.id); return {"id": a.id}


@router.delete("/assignments/{aid}")
def unassign(aid: int, db: DB, admin: Admin):
    a = db.get(TeacherAssignment, aid) or _nf(); db.delete(a); commit(db); log_action(db, admin.id, "teacher_unassigned", "assignment", aid)
    return {"ok": True}


# ---------------- attendance ----------------
def _filters(date_from, date_to, class_id, subject_id, teacher_id, student_id, q):
    return dict(date_from=date_from, date_to=date_to, class_id=class_id, subject_id=subject_id,
                teacher_id=teacher_id, student_id=student_id, q=q or None)


@router.get("/attendance")
def attendance(db: DB, date_from: date | None = None, date_to: date | None = None, class_id: int | None = None,
               subject_id: int | None = None, teacher_id: int | None = None, student_id: int | None = None, q: str = ""):
    rows = reports.query_rows(db, limit=500, **_filters(date_from, date_to, class_id, subject_id, teacher_id, student_id, q))
    return {"rows": rows, "summary": reports.summarize(rows)}


@router.get("/attendance/export")
def attendance_export(db: DB, fmt: str = Query("csv", pattern="^(csv|pdf)$"), date_from: date | None = None, date_to: date | None = None,
                      class_id: int | None = None, subject_id: int | None = None, teacher_id: int | None = None,
                      student_id: int | None = None, q: str = ""):
    rows = reports.query_rows(db, **_filters(date_from, date_to, class_id, subject_id, teacher_id, student_id, q))
    return export(rows, fmt, "attendance-report", "Institution Attendance Report")


class CorrectIn(BaseModel):
    status: str = Field(pattern="^(present|absent)$")
    reason: str = Field(min_length=3, max_length=300)


@router.patch("/attendance/{rid}")
def correct(rid: int, body: CorrectIn, db: DB, admin: Admin):
    r = db.get(AttendanceRecord, rid) or _nf(); old = r.status
    r.status, r.method, r.marked_by, r.marked_at = body.status, "manual", admin.id, utcnow()
    commit(db); log_action(db, admin.id, "attendance_corrected", "attendance_record", rid, f"{old} -> {body.status}. Reason: {body.reason}")
    return {"ok": True}


@router.get("/audit")
def audit(db: DB, limit: int = Query(200, le=500), action: str = "", user_id: int | None = None):
    st = select(AuditLog, User.full_name).outerjoin(User, User.id == AuditLog.actor_user_id).order_by(AuditLog.id.desc()).limit(limit)
    if action: st = st.where(AuditLog.action == action)
    if user_id: st = st.where(AuditLog.actor_user_id == user_id)
    return [{"id": l.id, "actor": n, "action": l.action, "entity": l.entity, "entity_id": l.entity_id, "details": l.details,
             "at": iso(l.created_at)} for l, n in db.execute(st)]


# ---------------- teacher face registration ----------------
@router.post("/teachers/{tid}/face")
def teacher_face_enroll(tid: int, body: FaceIn, db: DB, admin: Admin):
    if not body.consent: raise HTTPException(400, "Written consent from the teacher is required")
    db.get(Teacher, tid) or _nf()
    try: embs = [face.validate(e) for e in body.embeddings]
    except ValueError: raise HTTPException(400, "Invalid face data")
    for e in embs:
        if face.is_duplicate(db, e, exclude_teacher=tid): raise HTTPException(409, "This face already appears to be registered to someone else")
    db.execute(delete(StaffFaceTemplate).where(StaffFaceTemplate.teacher_id == tid))
    for e in embs:
        db.add(StaffFaceTemplate(teacher_id=tid, embedding_encrypted=face.encrypt(e), consent_given_at=utcnow(), consent_recorded_by=admin.id))
    commit(db); log_action(db, admin.id, "staff_face_enrolled", "teacher", tid, f"{len(embs)} templates, consent recorded"); return {"templates": len(embs)}


@router.delete("/teachers/{tid}/face")
def teacher_face_delete(tid: int, db: DB, admin: Admin):
    db.execute(delete(StaffFaceTemplate).where(StaffFaceTemplate.teacher_id == tid)); commit(db)
    log_action(db, admin.id, "staff_face_deleted", "teacher", tid); return {"ok": True}


# ---------------- staff attendance (admin view) ----------------
def _staff_rows(db: Session, date_from, date_to, teacher_id):
    st = (select(StaffAttendance, User.full_name, User.username).join(Teacher, Teacher.id == StaffAttendance.teacher_id)
          .join(User, User.id == Teacher.user_id).order_by(StaffAttendance.work_date.desc(), StaffAttendance.check_in_at)
          .where(StaffAttendance.work_date >= date_from, StaffAttendance.work_date <= date_to))
    if teacher_id: st = st.where(StaffAttendance.teacher_id == teacher_id)
    return [{**staff_out(r), "teacher": n, "username": u} for r, n, u in db.execute(st)]


@router.get("/staff-attendance")
def staff_attendance(db: DB, date_from: date | None = None, date_to: date | None = None, teacher_id: int | None = None):
    df = date_from or today(); dt = date_to or df
    rows = _staff_rows(db, df, dt, teacher_id); missing = []
    if df == dt and not teacher_id:
        have = {r["teacher_id"] for r in rows}
        missing = [{"teacher_id": t.id, "teacher": u.full_name, "username": u.username}
                   for t, u in db.execute(select(Teacher, User).join(User, User.id == Teacher.user_id).where(User.is_active).order_by(User.full_name)) if t.id not in have]
    return {"rows": rows, "missing": missing, "summary": {"checked_in": len(rows), "checked_out": sum(1 for r in rows if r["check_out_at"]),
                                                          "still_in": sum(1 for r in rows if not r["check_out_at"]), "missing": len(missing)}}


@router.get("/staff-attendance/export")
def staff_export(db: DB, fmt: str = Query("csv", pattern="^(csv|pdf)$"), date_from: date | None = None, date_to: date | None = None, teacher_id: int | None = None):
    df = date_from or today(); dt = date_to or df
    rows = _staff_rows(db, df, dt, teacher_id)
    hdr = ["Date", "Teacher", "Employee ID", "Check-in", "Check-out", "Hours", "In method", "Out method"]
    data = [[r["date"], r["teacher"], r["username"], local_hm(datetime.fromisoformat(r["check_in_at"])), local_hm(datetime.fromisoformat(r["check_out_at"])) if r["check_out_at"] else "",
             r["hours"] if r["hours"] is not None else "", r["in_method"], r["out_method"] or ""] for r in rows]
    return export_table(hdr, data, fmt, "staff-attendance", "Staff Attendance Report")


class StaffManual(BaseModel):
    teacher_id: int
    work_date: date
    check_in_time: time | None = None
    check_out_time: time | None = None
    reason: str = Field(min_length=3, max_length=300)


@router.put("/staff-attendance")
def staff_manual(body: StaffManual, db: DB, admin: Admin):
    """Create or correct a day's record. Still one row per teacher per day; every change needs a reason and is audited."""
    if body.check_in_time is None and body.check_out_time is None: raise HTTPException(400, "Enter a check-in or check-out time")
    if body.work_date > today(): raise HTTPException(400, "Cannot record attendance for a future date")
    db.get(Teacher, body.teacher_id) or _nf()
    tz = ZoneInfo(settings.timezone)
    conv = lambda tm: datetime.combine(body.work_date, tm, tzinfo=tz).astimezone(timezone.utc)  # noqa
    r = db.scalar(select(StaffAttendance).where(StaffAttendance.teacher_id == body.teacher_id, StaffAttendance.work_date == body.work_date))
    cin = conv(body.check_in_time) if body.check_in_time else (as_utc(r.check_in_at) if r else None)
    cout = conv(body.check_out_time) if body.check_out_time else (as_utc(r.check_out_at) if r and r.check_out_at else None)
    if cin is None: raise HTTPException(400, "A check-in time is required first")
    if cout and cout <= cin: raise HTTPException(400, "Check-out must be after check-in")
    if not r:
        r = StaffAttendance(teacher_id=body.teacher_id, work_date=body.work_date, check_in_at=cin, check_in_method="manual", check_in_by=admin.id); db.add(r)
    elif body.check_in_time:
        r.check_in_at, r.check_in_method, r.check_in_confidence, r.check_in_ip, r.check_in_by = cin, "manual", None, None, admin.id
    if body.check_out_time:
        r.check_out_at, r.check_out_method, r.check_out_confidence, r.check_out_ip, r.check_out_by = cout, "manual", None, None, admin.id
    commit(db)
    log_action(db, admin.id, "staff_attendance_manual", "teacher", body.teacher_id,
               f"{body.work_date}: in={body.check_in_time or '-'} out={body.check_out_time or '-'}. Reason: {body.reason}")
    return {"ok": True}


@router.get("/class-presence")
def class_presence(db: DB, date_from: date | None = None, date_to: date | None = None, teacher_id: int | None = None):
    df = date_from or today(); dt = date_to or df
    st = (select(TeacherClassCheck, AttendanceSession.session_date, SchoolClass.name, Subject.name, User.full_name)
          .join(AttendanceSession, AttendanceSession.id == TeacherClassCheck.session_id).join(SchoolClass, SchoolClass.id == AttendanceSession.class_id)
          .join(Subject, Subject.id == AttendanceSession.subject_id).join(Teacher, Teacher.id == TeacherClassCheck.teacher_id).join(User, User.id == Teacher.user_id)
          .where(AttendanceSession.session_date >= df, AttendanceSession.session_date <= dt).order_by(TeacherClassCheck.verified_at.desc()).limit(500))
    if teacher_id: st = st.where(TeacherClassCheck.teacher_id == teacher_id)
    return [{"id": c.id, "date": d.isoformat(), "class_name": cn, "subject_name": sn, "teacher": tn, "verified_at": iso(c.verified_at),
             "method": c.method, "confidence": c.confidence, "reason": c.manual_reason} for c, d, cn, sn, tn in db.execute(st)]


def _nf(msg="Not found"):
    raise HTTPException(404, msg)
