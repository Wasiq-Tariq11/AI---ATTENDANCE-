from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index,
    LargeBinary, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from zoneinfo import ZoneInfo

from ..config import settings
from ..database import Base


def today() -> date:
    return datetime.now(ZoneInfo(settings.timezone)).date()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """Every login account. username = admin id / employee id / roll number."""
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin','teacher','student')", name="ck_user_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AcademicSession(Base):
    __tablename__ = "academic_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class Teacher(Base):
    __tablename__ = "teachers"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), unique=True)
    department: Mapped[str | None] = mapped_column(String(80))


class SchoolClass(Base):
    __tablename__ = "classes"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    academic_session_id: Mapped[int | None] = mapped_column(ForeignKey("academic_sessions.id", ondelete="RESTRICT"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("name", "academic_session_id", name="uq_class_name_session"),)


class Subject(Base):
    __tablename__ = "subjects"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Student(Base):
    __tablename__ = "students"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), unique=True)
    roll_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(160))


class TeacherAssignment(Base):
    """Teacher X teaches subject Y to class Z."""
    __tablename__ = "teacher_assignments"
    __table_args__ = (UniqueConstraint("teacher_id", "class_id", "subject_id", name="uq_teacher_assignment"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id", ondelete="RESTRICT"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="RESTRICT"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"))


class ClassSubject(Base):
    __tablename__ = "class_subjects"
    __table_args__ = (UniqueConstraint("class_id", "subject_id", name="uq_class_subject"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="RESTRICT"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"))


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("student_id", "class_id", name="uq_enrollment"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="RESTRICT"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="RESTRICT"), index=True)


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        CheckConstraint("status IN ('open','closed')", name="ck_session_status"),
        UniqueConstraint("teacher_id", "class_id", "subject_id", "session_date", name="uq_one_session_per_teacher_class_subject_day"),
        Index("ix_session_class_date", "class_id", "session_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id", ondelete="RESTRICT"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="RESTRICT"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="RESTRICT"))
    session_date: Mapped[date] = mapped_column(Date, default=today)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(10), default="open")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_one_record_per_student_per_session"),
        CheckConstraint("status IN ('present','absent')", name="ck_record_status"),
        CheckConstraint("method IN ('face','manual')", name="ck_record_method"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="RESTRICT"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(10))
    method: Mapped[str] = mapped_column(String(10))
    confidence: Mapped[float | None] = mapped_column(Float)
    marked_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FaceTemplate(Base):
    """Embedding stored as encrypted bytes (encryption added in the face phase)."""
    __tablename__ = "face_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="RESTRICT"), index=True)
    embedding_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    consent_given_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consent_recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str | None] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    details: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class StaffFaceTemplate(Base):
    """Encrypted face embeddings of teachers (kept separate from student templates)."""
    __tablename__ = "staff_face_templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id", ondelete="RESTRICT"), index=True)
    embedding_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    consent_given_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consent_recorded_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StaffAttendance(Base):
    """ONE row per teacher per day holds both check-in and check-out.
    The unique constraint makes a second check-in on the same day impossible at database level,
    and check-out can only be written once (conditional update in the API + CHECK constraints here)."""
    __tablename__ = "staff_attendance"
    __table_args__ = (
        UniqueConstraint("teacher_id", "work_date", name="uq_one_staff_row_per_teacher_per_day"),
        CheckConstraint("check_in_method IN ('face','manual')", name="ck_staff_in_method"),
        CheckConstraint("check_out_method IS NULL OR check_out_method IN ('face','manual')", name="ck_staff_out_method"),
        CheckConstraint("check_out_at IS NULL OR check_out_at > check_in_at", name="ck_staff_out_after_in"),
        CheckConstraint("(check_out_at IS NULL) = (check_out_method IS NULL)", name="ck_staff_out_pair"),
        Index("ix_staff_work_date", "work_date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id", ondelete="RESTRICT"), index=True)
    work_date: Mapped[date] = mapped_column(Date, default=today)
    check_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    check_in_method: Mapped[str] = mapped_column(String(10))
    check_in_confidence: Mapped[float | None] = mapped_column(Float)
    check_in_ip: Mapped[str | None] = mapped_column(String(45))
    check_in_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out_method: Mapped[str | None] = mapped_column(String(10))
    check_out_confidence: Mapped[float | None] = mapped_column(Float)
    check_out_ip: Mapped[str | None] = mapped_column(String(45))
    check_out_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class TeacherClassCheck(Base):
    """Proof the assigned teacher was present when a class session started (one per session)."""
    __tablename__ = "teacher_class_checks"
    __table_args__ = (CheckConstraint("method IN ('face','manual')", name="ck_classcheck_method"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("attendance_sessions.id", ondelete="RESTRICT"), unique=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id", ondelete="RESTRICT"), index=True)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    method: Mapped[str] = mapped_column(String(10))
    confidence: Mapped[float | None] = mapped_column(Float)
    manual_reason: Mapped[str | None] = mapped_column(Text)
