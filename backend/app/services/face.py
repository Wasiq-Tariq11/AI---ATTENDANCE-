import base64, hashlib
import numpy as np
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models.tables import Enrollment, FaceTemplate, StaffFaceTemplate, Student, Teacher, User


def _fernet() -> Fernet:
    raw = settings.face_encryption_key or settings.secret_key
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest()))


def validate(vec) -> np.ndarray:
    a = np.asarray(vec, dtype=np.float32)
    if a.shape != (128,) or not np.all(np.isfinite(a)) or not (0.5 < np.linalg.norm(a) < 3.0):
        raise ValueError("Invalid face embedding")
    return a


def encrypt(vec) -> bytes:
    return _fernet().encrypt(validate(vec).tobytes())


def decrypt(blob: bytes) -> np.ndarray:
    return np.frombuffer(_fernet().decrypt(blob), dtype=np.float32)


def ranked_matches(db: Session, emb, class_id=None, exclude_student=None):
    """Return [(student_id, distance)] best first (one entry per student)."""
    q = (select(FaceTemplate.student_id, FaceTemplate.embedding_encrypted)
         .join(Student, Student.id == FaceTemplate.student_id)
         .join(User, User.id == Student.user_id).where(User.is_active))
    if class_id:
        q = q.join(Enrollment, Enrollment.student_id == FaceTemplate.student_id).where(Enrollment.class_id == class_id)
    if exclude_student:
        q = q.where(FaceTemplate.student_id != exclude_student)
    best: dict[int, float] = {}
    for sid, blob in db.execute(q).all():
        d = float(np.linalg.norm(decrypt(blob) - emb))
        best[sid] = min(d, best.get(sid, 9.0))
    return sorted(best.items(), key=lambda x: x[1])


def decide(matches):
    """-> (student_id|None, distance|None, 'ok'|'unknown'|'ambiguous')"""
    if not matches or matches[0][1] > settings.face_match_threshold:
        return None, None, "unknown"
    if len(matches) > 1 and matches[1][1] - matches[0][1] < settings.face_margin:
        return None, None, "ambiguous"
    return matches[0][0], matches[0][1], "ok"


def confidence(distance: float) -> float:
    return round(max(0.0, min(1.0, 1 - distance / 0.75)), 3)


def ranked_staff(db: Session, emb, exclude_teacher=None):
    """[(teacher_id, distance)] best first, over ALL active teachers with a registered face."""
    q = (select(StaffFaceTemplate.teacher_id, StaffFaceTemplate.embedding_encrypted)
         .join(Teacher, Teacher.id == StaffFaceTemplate.teacher_id).join(User, User.id == Teacher.user_id).where(User.is_active))
    if exclude_teacher:
        q = q.where(StaffFaceTemplate.teacher_id != exclude_teacher)
    best: dict[int, float] = {}
    for tid, blob in db.execute(q).all():
        d = float(np.linalg.norm(decrypt(blob) - emb))
        best[tid] = min(d, best.get(tid, 9.0))
    return sorted(best.items(), key=lambda x: x[1])


def is_duplicate(db: Session, emb, exclude_student=None, exclude_teacher=None, limit=0.40) -> bool:
    """True if this face is already registered to ANYONE else (student or teacher)."""
    for ranked in (ranked_matches(db, emb, exclude_student=exclude_student), ranked_staff(db, emb, exclude_teacher=exclude_teacher)):
        if ranked and ranked[0][1] < limit:
            return True
    return False
