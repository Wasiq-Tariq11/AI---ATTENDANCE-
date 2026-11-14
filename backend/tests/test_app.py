import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/t.db"
import numpy as np, pytest
from fastapi.testclient import TestClient
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models.tables import User
from app.security import hash_password

rng = np.random.default_rng(1)
def vec(): v = rng.normal(size=128); return (v / np.linalg.norm(v) * 0.9).astype(float)
def near(v, s=0.02): return (v + rng.normal(size=128) * s).tolist()

@pytest.fixture(scope="module")
def c():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        db.add(User(username="admin_x", full_name="Admin", role="admin", password_hash=hash_password("Admin@12345"))); db.commit()
    with TestClient(app) as cl: yield cl

def H(c, u, p, r): return {"Authorization": "Bearer " + c.post("/api/auth/login", json={"username": u, "password": p, "role": r}).json()["access_token"]}

S = {}
def test_setup_by_admin(c):
    A = H(c, "admin_x", "Admin@12345", "admin"); S["A"] = A
    S["cls"] = c.post("/api/admin/classes", json={"name": "X1"}, headers=A).json()["id"]
    S["cls2"] = c.post("/api/admin/classes", json={"name": "X2"}, headers=A).json()["id"]
    S["sub"] = c.post("/api/admin/subjects", json={"code": "S1", "name": "Maths"}, headers=A).json()["id"]
    assert c.post("/api/admin/subjects", json={"code": "S1", "name": "dup"}, headers=A).status_code == 409
    for cid in (S["cls"], S["cls2"]): assert c.put(f"/api/admin/classes/{cid}/subjects", json={"subject_ids": [S["sub"]]}, headers=A).status_code == 200
    t = c.post("/api/admin/teachers", json={"username": "tch1", "full_name": "Teach One"}, headers=A).json(); S["t"], S["tpw"] = t["id"], t["temp_password"]
    t2 = c.post("/api/admin/teachers", json={"username": "tch2", "full_name": "Teach Two"}, headers=A).json(); S["t2pw"] = t2["temp_password"]
    assert c.post("/api/admin/assignments", json={"teacher_id": S["t"], "class_id": S["cls"], "subject_id": S["sub"]}, headers=A).status_code == 201
    S["stu"] = []
    for i in range(3):
        r = c.post("/api/admin/students", json={"roll_number": f"R{i}", "full_name": f"Stu {i}", "class_id": S["cls"]}, headers=A).json(); S["stu"].append(r)
    assert c.post("/api/admin/students", json={"roll_number": "R0", "full_name": "dup"}, headers=A).status_code == 409
    assert c.get("/api/admin/stats", headers=A).status_code == 200

def test_face_enroll_needs_consent_and_dedupes(c):
    A = S["A"]; S["v"] = [vec() for _ in range(3)]
    assert c.post(f"/api/admin/students/{S['stu'][0]['id']}/face", json={"consent": False, "embeddings": [S["v"][0].tolist()]}, headers=A).status_code == 400
    for i in range(3): assert c.post(f"/api/admin/students/{S['stu'][i]['id']}/face", json={"consent": True, "embeddings": [near(S["v"][i]), near(S["v"][i])]}, headers=A).status_code == 200
    assert c.post(f"/api/admin/students/{S['stu'][0]['id']}/face".replace(str(S['stu'][0]['id']), str(S['stu'][1]['id'])), json={"consent": True, "embeddings": [near(S["v"][0])]}, headers=A).status_code == 409
    assert all("embedding" not in str(x).lower() for x in c.get("/api/admin/students", headers=A).json())

def test_teacher_flow(c):
    T = H(c, "tch1", S["tpw"], "teacher")
    assert c.get("/api/admin/stats", headers=T).status_code == 403
    d = c.get("/api/teacher/dashboard", headers=T).json(); assert len(d["assignments"]) == 1
    assert c.post("/api/teacher/sessions", json={"class_id": S["cls2"], "subject_id": S["sub"]}, headers=T).status_code == 403
    assert c.post("/api/teacher/sessions", json={"class_id": S["cls"], "subject_id": S["sub"]}, headers=T).json() == {"result": "verification_required"}
    sid = c.post("/api/teacher/sessions", json={"class_id": S["cls"], "subject_id": S["sub"], "manual_reason": "Camera test"}, headers=T).json()["id"]
    assert c.post("/api/teacher/sessions", json={"class_id": S["cls"], "subject_id": S["sub"]}, headers=T).json()["id"] == sid
    m = lambda e: c.post(f"/api/teacher/sessions/{sid}/face-match", json={"embedding": e}, headers=T).json()
    r = m(near(S["v"][0])); assert r["result"] == "marked" and r["student"]["roll"] == "R0"
    assert m(near(S["v"][0]))["result"] == "already"
    unk = m(vec().tolist()); assert unk == {"result": "unknown"}
    assert c.post(f"/api/teacher/sessions/{sid}/mark", json={"student_id": S["stu"][1]["id"], "status": "present", "reason": ""}, headers=T).status_code == 422
    assert c.post(f"/api/teacher/sessions/{sid}/mark", json={"student_id": S["stu"][1]["id"], "status": "present", "reason": "Camera issue"}, headers=T).status_code == 200
    T2 = H(c, "tch2", S["t2pw"], "teacher")
    assert c.get(f"/api/teacher/sessions/{sid}", headers=T2).status_code == 404
    done = c.post(f"/api/teacher/sessions/{sid}/close", json={}, headers=T).json(); assert (done["present"], done["absent"]) == (2, 1)
    assert c.post(f"/api/teacher/sessions/{sid}/face-match", json={"embedding": near(S["v"][2])}, headers=T).status_code == 409
    st = c.get(f"/api/teacher/students?class_id={S['cls']}&q=stu 0", headers=T).json(); assert len(st) == 1 and st[0]["percentage"] == 100.0
    assert c.get(f"/api/teacher/students?class_id={S['cls2']}", headers=T).status_code == 403
    assert c.get(f"/api/teacher/report?class_id={S['cls']}&fmt=csv", headers=T).status_code == 200
    assert c.get(f"/api/teacher/report?class_id={S['cls']}&fmt=pdf", headers=T).content[:4] == b"%PDF"

def test_ambiguous_face(c):
    A = S["A"]; a = vec(); d = rng.normal(size=128); d = d / np.linalg.norm(d) * 0.42
    r1 = c.post("/api/admin/students", json={"roll_number": "AM1", "full_name": "Amb1", "class_id": S["cls"]}, headers=A).json()
    r2 = c.post("/api/admin/students", json={"roll_number": "AM2", "full_name": "Amb2", "class_id": S["cls"]}, headers=A).json()
    c.post(f"/api/admin/students/{r1['id']}/face", json={"consent": True, "embeddings": [a.tolist()]}, headers=A)
    assert c.post(f"/api/admin/students/{r2['id']}/face", json={"consent": True, "embeddings": [(a + d).tolist()]}, headers=A).status_code == 200
    T = H(c, "tch1", S["tpw"], "teacher")
    sid = c.post("/api/teacher/sessions", json={"class_id": S["cls"], "subject_id": S["sub"]}, headers=T).json()["id"]
    assert c.post(f"/api/teacher/sessions/{sid}/face-match", json={"embedding": (a + d / 2).tolist()}, headers=T).json()["result"] == "ambiguous"
    assert c.post(f"/api/teacher/sessions/{sid}/close", headers=T).status_code == 200

def test_student_isolation_and_reports(c):
    Sx = H(c, "R0", S["stu"][0]["temp_password"], "student")
    sm = c.get("/api/student/summary", headers=Sx).json(); assert sm["overall"]["present"] == 1 and sm["profile"]["roll"] == "R0"
    assert c.get("/api/student/history", headers=Sx).json()[0]["status"] == "present"
    assert c.get("/api/student/report?fmt=pdf", headers=Sx).content[:4] == b"%PDF"
    for p in ("/api/admin/stats", "/api/teacher/dashboard"): assert c.get(p, headers=Sx).status_code == 403
    assert c.post("/api/teacher/sessions", json={"class_id": 1, "subject_id": 1}, headers=Sx).status_code == 403
    assert c.patch("/api/admin/attendance/1", json={"status": "present", "reason": "x y z"}, headers=Sx).status_code == 403

def test_admin_correction_audit_export(c):
    A = S["A"]; rows = c.get("/api/admin/attendance", headers=A).json()["rows"]
    rec = next(r for r in rows if r["roll"] == "R2")
    assert c.patch(f"/api/admin/attendance/{rec['record_id']}", json={"status": "present", "reason": "ab"}, headers=A).status_code == 422
    assert c.patch(f"/api/admin/attendance/{rec['record_id']}", json={"status": "present", "reason": "Was present, camera missed"}, headers=A).status_code == 200
    logs = c.get("/api/admin/audit?action=attendance_corrected", headers=A).json(); assert "absent -> present" in logs[0]["details"]
    assert c.get("/api/admin/attendance/export?fmt=csv", headers=A).text.startswith("\ufeffDate")
    assert c.delete(f"/api/admin/students/{S['stu'][0]['id']}", headers=A).status_code == 409
    assert c.post(f"/api/admin/users/{S['stu'][0]['id']}/reset-password", headers=A).status_code == 200
