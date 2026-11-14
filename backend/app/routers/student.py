from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from ..models.tables import *  # noqa
from ..security import require_roles
from ..services import reports
from .common import DB, export

Stu = Annotated[User, Depends(require_roles("student"))]
router = APIRouter(prefix="/api/student", tags=["student"], dependencies=[Depends(require_roles("student"))])


def _me(db, user) -> Student:
    s = db.scalar(select(Student).where(Student.user_id == user.id))
    if not s: raise HTTPException(403, "No student profile")
    return s


@router.get("/summary")
def summary(db: DB, user: Stu):
    s = _me(db, user)
    rows = reports.query_rows(db, student_id=s.id, limit=5000)  # always filtered to the logged-in student
    subj: dict = {}
    for r in rows:
        a = subj.setdefault(r["subject_name"], {"present": 0, "absent": 0}); a[r["status"]] += 1
    cls = db.scalar(select(SchoolClass.name).join(Enrollment, Enrollment.class_id == SchoolClass.id).where(Enrollment.student_id == s.id))
    return {"profile": {"name": user.full_name, "roll": s.roll_number, "email": s.email, "class_name": cls},
            "overall": reports.summarize(rows),
            "subjects": [{"name": k, **v, "total": v["present"] + v["absent"],
                          "percentage": round(100 * v["present"] / (v["present"] + v["absent"]), 1)} for k, v in sorted(subj.items())]}


@router.get("/history")
def history(db: DB, user: Stu, subject_id: int | None = None):
    rows = reports.query_rows(db, student_id=_me(db, user).id, subject_id=subject_id, limit=1000)
    return [{k: r[k] for k in ("date", "subject_id", "subject_name", "class_name", "status", "method", "teacher_name")} for r in rows]


@router.get("/report")
def report(db: DB, user: Stu, fmt: str = Query("csv", pattern="^(csv|pdf)$")):
    return export(reports.query_rows(db, student_id=_me(db, user).id), fmt, "my-attendance", f"Attendance Report - {user.full_name}")
