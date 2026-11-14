import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.tables import *  # noqa
from app.security import hash_password, _failures


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        for u, r, active in [("admin1", "admin", True), ("t1", "teacher", True),
                             ("s1", "student", True), ("off", "teacher", False)]:
            db.add(User(username=u, full_name=u.upper(), role=r, is_active=active,
                        password_hash=hash_password("Password123!")))
        db.commit()
    with TestClient(app) as c:
        yield c


def login(c, u, p, r):
    return c.post("/api/auth/login", json={"username": u, "password": p, "role": r})


def token(c, u, r):
    return {"Authorization": "Bearer " + login(c, u, "Password123!", r).json()["access_token"]}


def test_good_login(client):
    assert login(client, "admin1", "Password123!", "admin").status_code == 200


def test_wrong_password(client):
    assert login(client, "t1", "nope", "teacher").status_code == 401


def test_wrong_role_page(client):
    assert login(client, "s1", "Password123!", "admin").status_code == 401


def test_unknown_user(client):
    assert login(client, "ghost", "x", "student").status_code == 401


def test_inactive_user(client):
    assert login(client, "off", "Password123!", "teacher").status_code == 401


def test_me_needs_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_rbac_admin_only(client):
    assert client.get("/api/admin/ping", headers=token(client, "admin1", "admin")).status_code == 200
    assert client.get("/api/admin/ping", headers=token(client, "t1", "teacher")).status_code == 403
    assert client.get("/api/admin/ping", headers=token(client, "s1", "student")).status_code == 403
    assert client.get("/api/admin/ping").status_code == 401


def test_change_password(client):
    h = token(client, "s1", "student")
    assert client.post("/api/auth/change-password", headers=h,
                       json={"current_password": "bad", "new_password": "NewPass456!"}).status_code == 400
    assert client.post("/api/auth/change-password", headers=h,
                       json={"current_password": "Password123!", "new_password": "short"}).status_code == 422
    assert client.post("/api/auth/change-password", headers=h,
                       json={"current_password": "Password123!", "new_password": "NewPass456!"}).status_code == 200
    assert login(client, "s1", "NewPass456!", "student").status_code == 200


def test_rate_limit(client):
    _failures.clear()
    codes = [login(client, "t1", "wrong", "teacher").status_code for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429
    # even the right password is blocked while locked
    assert login(client, "t1", "Password123!", "teacher").status_code == 429


def test_password_not_plaintext():
    with SessionLocal() as db:
        u = db.query(User).filter_by(username="t1").one()
        assert u.password_hash.startswith("$argon2")


def test_duplicate_attendance_blocked():
    with SessionLocal() as db:
        db.add_all([User(username="tx", full_name="T", role="teacher", password_hash="x"),
                    User(username="sx", full_name="S", role="student", password_hash="x"),
                    Subject(code="CS1", name="Intro"), SchoolClass(name="A")])
        db.commit()
        t = Teacher(user_id=db.query(User).filter_by(username="tx").one().id)
        s = Student(user_id=db.query(User).filter_by(username="sx").one().id, roll_number="ZZ-R1")
        db.add_all([t, s]); db.commit()
        sess = AttendanceSession(teacher_id=t.id, class_id=1, subject_id=1)
        db.add(sess); db.commit()
        db.add(AttendanceRecord(session_id=sess.id, student_id=s.id, status="present", method="face"))
        db.commit()
        db.add(AttendanceRecord(session_id=sess.id, student_id=s.id, status="present", method="manual"))
        with pytest.raises(IntegrityError):
            db.commit()
