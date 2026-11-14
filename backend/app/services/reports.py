import csv, io
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, aliased

from ..models.tables import (AttendanceRecord, AttendanceSession, SchoolClass, Student, Subject,
                             Teacher, User)


def query_rows(db: Session, *, student_id=None, class_id=None, subject_id=None, teacher_id=None,
               date_from=None, date_to=None, q=None, limit=5000):
    TU, SU = aliased(User), aliased(User)
    st = (select(
        AttendanceRecord.id.label("record_id"), AttendanceSession.id.label("session_id"),
        AttendanceSession.session_date.label("date"), SchoolClass.id.label("class_id"),
        SchoolClass.name.label("class_name"), Subject.id.label("subject_id"),
        Subject.name.label("subject_name"), Student.id.label("student_id"),
        Student.roll_number.label("roll"), SU.full_name.label("student_name"),
        TU.full_name.label("teacher_name"), AttendanceRecord.status.label("status"),
        AttendanceRecord.method.label("method"), AttendanceRecord.confidence.label("confidence"))
        .select_from(AttendanceRecord)
        .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
        .join(SchoolClass, SchoolClass.id == AttendanceSession.class_id)
        .join(Subject, Subject.id == AttendanceSession.subject_id)
        .join(Student, Student.id == AttendanceRecord.student_id)
        .join(SU, SU.id == Student.user_id)
        .join(Teacher, Teacher.id == AttendanceSession.teacher_id)
        .join(TU, TU.id == Teacher.user_id)
        .where(AttendanceSession.status == "closed")
        .order_by(AttendanceSession.session_date.desc(), AttendanceRecord.id.desc()).limit(limit))
    if student_id: st = st.where(Student.id == student_id)
    if class_id: st = st.where(SchoolClass.id == class_id)
    if subject_id: st = st.where(Subject.id == subject_id)
    if teacher_id: st = st.where(Teacher.id == teacher_id)
    if date_from: st = st.where(AttendanceSession.session_date >= date_from)
    if date_to: st = st.where(AttendanceSession.session_date <= date_to)
    if q: st = st.where(or_(SU.full_name.ilike(f"%{q}%"), Student.roll_number.ilike(f"%{q}%")))
    rows = []
    for r in db.execute(st).mappings():
        d = dict(r); d["date"] = d["date"].isoformat(); rows.append(d)
    return rows


def summarize(rows):
    p = sum(1 for r in rows if r["status"] == "present")
    return {"present": p, "absent": len(rows) - p, "total": len(rows),
            "percentage": round(100 * p / len(rows), 1) if rows else 0.0}


COLS = [("Date", "date"), ("Class", "class_name"), ("Subject", "subject_name"), ("Roll No", "roll"),
        ("Student", "student_name"), ("Teacher", "teacher_name"), ("Status", "status"), ("Method", "method")]


def _safe(v):  # stop spreadsheet formula injection
    s = str(v if v is not None else "")
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s


def to_csv(rows) -> bytes:
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow([c[0] for c in COLS])
    for r in rows: w.writerow([_safe(r[c[1]]) for c in COLS])
    return buf.getvalue().encode("utf-8-sig")


def to_pdf(rows, title="Attendance Report") -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    buf = io.BytesIO(); s = summarize(rows)
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24)
    ss = getSampleStyleSheet()
    data = [[c[0] for c in COLS]] + [[str(r[c[1]]) for c in COLS] for r in rows[:2000]]
    t = Table(data, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
                           ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTSIZE", (0, 0), (-1, -1), 8),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1"))]))
    doc.build([Paragraph(title, ss["Title"]),
               Paragraph(f"Present {s['present']} &nbsp; Absent {s['absent']} &nbsp; Attendance {s['percentage']}%", ss["Normal"]),
               Spacer(1, 10), t])
    return buf.getvalue()


def table_csv(headers, rows) -> bytes:
    buf = io.StringIO(); w = csv.writer(buf); w.writerow(headers)
    for r in rows: w.writerow([_safe(c) for c in r])
    return buf.getvalue().encode("utf-8-sig")


def table_pdf(title, headers, rows) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    buf = io.BytesIO(); ss = getSampleStyleSheet()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24)
    t = Table([list(headers)] + [[str(c if c is not None else "") for c in r] for r in rows[:2000]], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("FONTSIZE", (0, 0), (-1, -1), 8), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1"))]))
    doc.build([Paragraph(title, ss["Title"]), Spacer(1, 10), t])
    return buf.getvalue()
