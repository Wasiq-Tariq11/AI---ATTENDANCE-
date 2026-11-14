import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/s.db"
import numpy as np, pytest
from datetime import timedelta
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.tables import *  # noqa
from app.models.tables import today, utcnow
from app.security import hash_password

rng = np.random.default_rng(11)
def vec(): v = rng.normal(size=128); return (v / np.linalg.norm(v) * 0.9)
def near(v, s=0.02): return (v + rng.normal(size=128) * s).tolist()
PW = "Admin@12345"
S = {}


@pytest.fixture(scope="module")
def c():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        db.add(User(username="sf_admin", full_name="Admin", role="admin", password_hash=hash_password(PW))); db.commit()
    with TestClient(app) as cl: yield cl


def H(c, u, p, r): return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"username": u, "password": p, "role": r}).json()["access_token"]}


def test_setup_and_face_uniqueness(c):
    A = H(c, "sf_admin", PW, "admin"); S["A"] = A
    for k in ("t1", "t2", "t3"):
        r = c.post("/api/admin/teachers", json={"username": "sf_" + k, "full_name": "Teacher " + k}, headers=A).json(); S[k] = r
    S["cls"] = c.post("/api/admin/classes", json={"name": "SF1"}, headers=A).json()["id"]
    S["sub"] = c.post("/api/admin/subjects", json={"code": "SF1", "name": "Sub"}, headers=A).json()["id"]
    c.put(f"/api/admin/classes/{S['cls']}/subjects", json={"subject_ids": [S["sub"]]}, headers=A)
    for k in ("t1", "t2"): assert c.post("/api/admin/assignments", json={"teacher_id": S[k]["id"], "class_id": S["cls"], "subject_id": S["sub"]}, headers=A).status_code == 201
    st = c.post("/api/admin/students", json={"roll_number": "SFR1", "full_name": "Stu", "class_id": S["cls"]}, headers=A).json(); S["stu"] = st
    S["fa"], S["fb"], S["fc"] = vec(), vec(), vec()
    put = lambda path, e, consent=True: c.post(path, json={"consent": consent, "embeddings": [e]}, headers=A).status_code
    assert put(f"/api/admin/teachers/{S['t1']['id']}/face", near(S["fa"]), consent=False) == 400
    assert put(f"/api/admin/teachers/{S['t1']['id']}/face", near(S["fa"])) == 200
    assert put(f"/api/admin/teachers/{S['t2']['id']}/face", near(S["fb"])) == 200
    assert put(f"/api/admin/teachers/{S['t2']['id']}/face", near(S["fa"])) == 409          # same face as teacher 1
    assert put(f"/api/admin/students/{st['id']}/face", near(S["fa"])) == 409               # teacher's face cannot be a student's
    assert put(f"/api/admin/students/{st['id']}/face", near(S["fc"])) == 200
    assert put(f"/api/admin/teachers/{S['t3']['id']}/face", near(S["fc"])) == 409          # student's face cannot be a teacher's
    assert all("embedding" not in str(x).lower() for x in c.get("/api/admin/teachers", headers=A).json())


def test_check_in_rules(c):
    T1 = H(c, "sf_t1", S["t1"]["temp_password"], "teacher"); S["T1"] = T1
    ci = lambda tok, e: c.post("/api/teacher/presence/check-in", json={"embedding": e}, headers=tok).json()
    r = ci(T1, near(S["fa"])); assert r["result"] == "checked_in" and r["record"]["in_method"] == "face"
    assert ci(T1, near(S["fa"]))["result"] == "already"                                   # duplicate check-in blocked
    with SessionLocal() as db:                                                             # ...and blocked by the database itself
        db.add(StaffAttendance(teacher_id=S["t1"]["id"], work_date=today(), check_in_at=utcnow(), check_in_method="face"))
        with pytest.raises(IntegrityError): db.commit()
    T3 = H(c, "sf_t3", S["t3"]["temp_password"], "teacher")
    assert ci(T3, near(S["fa"])) == {"result": "rejected", "reason": "not_registered"}      # no face on file -> cannot self check in
    T2 = H(c, "sf_t2", S["t2"]["temp_password"], "teacher"); S["T2"] = T2
    assert ci(T2, near(S["fa"])) == {"result": "rejected", "reason": "mismatch"}            # PROXY: t2's account, t1's face
    assert ci(T2, vec().tolist()) == {"result": "rejected", "reason": "mismatch"}           # stranger
    assert ci(T2, [0.0] * 128) == {"result": "rejected", "reason": "invalid"}
    logs = c.get("/api/admin/audit?action=staff_proxy_suspected", headers=S["A"]).json(); assert len(logs) == 1
    with SessionLocal() as db: assert db.scalar(select(StaffAttendance).where(StaffAttendance.teacher_id == S["t2"]["id"])) is None


def test_check_out_rules(c):
    T1, T2 = S["T1"], S["T2"]
    co = lambda tok, e: c.post("/api/teacher/presence/check-out", json={"embedding": e}, headers=tok).json()
    assert co(T2, near(S["fb"])) == {"result": "no_check_in"}
    assert co(T1, near(S["fa"]))["result"] == "too_soon"                                    # accidental double scan
    with SessionLocal() as db:
        db.execute(update(StaffAttendance).where(StaffAttendance.teacher_id == S["t1"]["id"]).values(check_in_at=utcnow() - timedelta(hours=8))); db.commit()
    assert co(T2, near(S["fa"]))["result"] == "no_check_in"                                 # t2 has not checked in: proxy can't check out for t1
    assert co(T1, near(S["fb"]))["result"] == "rejected"                                    # t1 account with t2's face
    r = co(T1, near(S["fa"])); assert r["result"] == "checked_out" and 7.9 < r["record"]["hours"] < 8.1
    assert co(T1, near(S["fa"]))["result"] == "already"                                     # duplicate check-out blocked
    assert c.post("/api/teacher/presence/check-in", json={"embedding": near(S["fa"])}, headers=T1).json()["result"] == "already"
    with SessionLocal() as db:
        with pytest.raises(IntegrityError):                                                 # check-out before check-in rejected by DB CHECK
            db.execute(update(StaffAttendance).where(StaffAttendance.teacher_id == S["t1"]["id"]).values(check_out_at=utcnow() - timedelta(days=1))); db.commit()
    h = c.get("/api/teacher/presence/history", headers=T1).json(); assert len(h) == 1 and h[0]["status"] == "complete"
    assert c.get("/api/teacher/presence/today", headers=T1).json()["record"]["status"] == "complete"


def test_campus_network_restriction(c):
    settings.campus_networks = "10.0.0.0/8"
    try:
        assert c.post("/api/teacher/presence/check-in", json={"embedding": near(S["fb"])}, headers=S["T2"]).status_code == 403
    finally: settings.campus_networks = ""
    assert c.post("/api/teacher/presence/check-in", json={"embedding": near(S["fb"])}, headers=S["T2"]).json()["result"] == "checked_in"


def test_class_start_requires_teacher_face(c):
    T1, T2 = S["T1"], S["T2"]; body = {"class_id": S["cls"], "subject_id": S["sub"]}
    st = lambda tok, **kw: c.post("/api/teacher/sessions", json={**body, **kw}, headers=tok).json()
    assert st(T1) == {"result": "verification_required"}
    assert st(T1, embedding=near(S["fb"]))["result"] == "rejected"                          # colleague's face
    r = st(T1, embedding=near(S["fa"])); assert r["result"] == "started" and r["method"] == "face"
    sid = r["id"]; assert st(T1)["id"] == sid and st(T1)["resumed"]                         # no second session
    assert c.post(f"/api/teacher/sessions/{sid}/close", headers=T1).status_code == 200
    again = st(T1); assert again["id"] == sid and again["resumed"]                          # reopen, not duplicate
    r2 = st(T2, manual_reason="Camera broken today"); assert r2["method"] == "manual"
    pres = c.get(f"/api/admin/class-presence", headers=S["A"]).json()
    assert {p["method"] for p in pres} == {"face", "manual"} and any(p["reason"] == "Camera broken today" for p in pres)
    with SessionLocal() as db:
        db.add(AttendanceSession(teacher_id=S["t1"]["id"], class_id=S["cls"], subject_id=S["sub"]))
        with pytest.raises(IntegrityError): db.commit()                                     # DB blocks a second same-day session
    settings.require_staff_checkin = True
    try:
        T3 = H(c, "sf_t3", S["t3"]["temp_password"], "teacher")
        with SessionLocal() as db: db.add(TeacherAssignment(teacher_id=S["t3"]["id"], class_id=S["cls"], subject_id=S["sub"])); db.commit()
        assert c.post("/api/teacher/sessions", json={**body, "manual_reason": "no checkin yet"}, headers=T3).status_code == 403
    finally: settings.require_staff_checkin = False


def test_admin_staff_views_and_manual_entry(c):
    A = S["A"]; d = today().isoformat()
    r = c.get("/api/admin/staff-attendance", headers=A).json()
    assert r["summary"]["checked_in"] == 2 and [m["username"] for m in r["missing"] if m["username"].startswith("sf_")] == ["sf_t3"]
    put = lambda **kw: c.put("/api/admin/staff-attendance", json={"teacher_id": S["t3"]["id"], "work_date": d, **kw}, headers=A)
    assert put(check_in_time="09:00").status_code == 422                                    # reason is mandatory
    assert put(check_in_time="09:00", reason="Biometric device offline").status_code == 200
    assert put(check_out_time="08:00", reason="typo").status_code == 400                     # out before in
    assert put(check_out_time="17:00", reason="Left on time").status_code == 200
    assert c.put("/api/admin/staff-attendance", json={"teacher_id": S["t3"]["id"], "work_date": (today() + timedelta(days=2)).isoformat(), "check_in_time": "09:00", "reason": "future"}, headers=A).status_code == 400
    row = [x for x in c.get("/api/admin/staff-attendance", headers=A).json()["rows"] if x["username"] == "sf_t3"]
    assert len(row) == 1 and row[0]["in_method"] == "manual" and row[0]["hours"] == 8.0   # still exactly one row per day
    assert any("Biometric device offline" in l["details"] for l in c.get("/api/admin/audit?action=staff_attendance_manual", headers=A).json())
    assert c.get("/api/admin/staff-attendance/export?fmt=csv", headers=A).text.startswith("\ufeffDate")
    assert c.get("/api/admin/staff-attendance/export?fmt=pdf", headers=A).content[:4] == b"%PDF"
    assert c.get("/api/admin/stats", headers=A).json()["staff_in_today"] == 3


def test_role_protection(c):
    for p in ("/api/admin/staff-attendance", "/api/admin/class-presence"): assert c.get(p, headers=S["T1"]).status_code == 403
    assert c.post("/api/teacher/presence/check-in", json={"embedding": [0.1] * 128}, headers=S["A"]).status_code == 403
    assert c.get("/api/teacher/presence/today").status_code == 401
