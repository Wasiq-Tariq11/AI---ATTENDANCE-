"""Fill a LOCAL database with fake demo data.  Run:  python -m app.scripts.seed_demo
Refuses to run in production. All passwords are printed at the end."""
import random
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from ..config import settings
from ..database import Base, SessionLocal, engine
from ..models.tables import *  # noqa
from ..models.tables import today, utcnow
from ..security import hash_password

PW = "Demo@12345"


def user(db, username, name, role):
    u = db.scalar(select(User).where(User.username == username))
    if not u:
        u = User(username=username, full_name=name, role=role, password_hash=hash_password(PW)); db.add(u); db.flush()
    return u


def main():
    if settings.environment == "production": raise SystemExit("Refusing to seed a production database.")
    Base.metadata.create_all(bind=engine); random.seed(7)
    with SessionLocal() as db:
        if db.scalar(select(Subject.id)): raise SystemExit("Database already has data. Delete attendance.db to re-seed.")
        user(db, "admin", "Dr. Meera Kapoor", "admin")
        ses = AcademicSession(name="2026-27", start_date=today().replace(month=1, day=1), end_date=today().replace(month=12, day=31), is_current=True)
        db.add(ses); db.flush()
        subs = [Subject(code=c, name=n) for c, n in [("CS101", "Data Structures"), ("CS102", "Database Systems"), ("MA101", "Discrete Mathematics"), ("PH101", "Applied Physics")]]
        cls = [SchoolClass(name=n, academic_session_id=ses.id) for n in ("BCA Year 1", "BCA Year 2")]
        db.add_all(subs + cls); db.flush()
        for c in cls:
            for s in subs: db.add(ClassSubject(class_id=c.id, subject_id=s.id))
        teachers = []
        for i, (n, dep) in enumerate([("Prof. Arjun Rao", "Computer Science"), ("Prof. Sana Iqbal", "Mathematics"), ("Prof. Vikram Nair", "Physics")]):
            u = user(db, f"T00{i+1}", n, "teacher"); t = Teacher(user_id=u.id, department=dep); db.add(t); db.flush(); teachers.append(t)
        plan = [(0, 0, 0), (0, 0, 1), (0, 1, 0), (0, 1, 1), (1, 2, 0), (1, 2, 1), (2, 3, 0), (2, 3, 1)]  # teacher, subject, class
        for ti, si, ci in plan: db.add(TeacherAssignment(teacher_id=teachers[ti].id, class_id=cls[ci].id, subject_id=subs[si].id))
        names = ["Aarav Sharma", "Diya Patel", "Kabir Singh", "Ananya Gupta", "Rohan Mehta", "Ishita Verma", "Vihaan Joshi", "Saanvi Reddy",
                 "Arnav Khan", "Myra Das", "Reyansh Iyer", "Kiara Nair", "Advik Bose", "Navya Menon", "Ayaan Malik", "Zoya Ansari"]
        studs = []
        for i, n in enumerate(names):
            u = user(db, f"BCA26{i+1:03d}", n, "student"); s = Student(user_id=u.id, roll_number=u.username, email=f"{u.username.lower()}@example.edu")
            db.add(s); db.flush(); ci = 0 if i < 8 else 1; db.add(Enrollment(student_id=s.id, class_id=cls[ci].id)); studs.append((s, ci, random.uniform(0.6, 0.97)))
        db.flush()
        for back in range(30, 0, -1):
            d = today() - timedelta(days=back)
            if d.weekday() == 6: continue
            for ti, si, ci in plan:
                if random.random() < 0.45: continue
                s_ = AttendanceSession(teacher_id=teachers[ti].id, class_id=cls[ci].id, subject_id=subs[si].id, session_date=d, status="closed")
                db.add(s_); db.flush()
                for st, sci, rate in studs:
                    if sci == ci:
                        db.add(AttendanceRecord(session_id=s_.id, student_id=st.id, status="present" if random.random() < rate else "absent",
                                                method="manual", marked_by=None))
        tz = ZoneInfo(settings.timezone)
        at = lambda d, h, m: datetime.combine(d, time(h, m), tzinfo=tz).astimezone(timezone.utc)  # noqa
        for back in range(30, 0, -1):
            d = today() - timedelta(days=back)
            if d.weekday() == 6: continue
            for t in teachers:
                if random.random() < 0.08: continue   # absent that day
                late = random.random() < 0.2
                i_, o_ = at(d, 9, random.randint(10, 40)) if late else at(d, 8, random.randint(30, 59)), at(d, random.randint(16, 17), random.randint(0, 59))
                db.add(StaffAttendance(teacher_id=t.id, work_date=d, check_in_at=i_, check_in_method="face", check_in_confidence=round(random.uniform(.7, .95), 3),
                                       check_in_ip="203.0.113.10", check_out_at=o_, check_out_method="face", check_out_confidence=round(random.uniform(.7, .95), 3), check_out_ip="203.0.113.10"))
        db.add(StaffAttendance(teacher_id=teachers[1].id, work_date=today(), check_in_at=utcnow() - timedelta(hours=1), check_in_method="face", check_in_confidence=0.9, check_in_ip="203.0.113.10"))
        for sess in db.scalars(select(AttendanceSession)):
            db.add(TeacherClassCheck(session_id=sess.id, teacher_id=sess.teacher_id, method="face", confidence=round(random.uniform(.7, .95), 3),
                                     verified_at=at(sess.session_date, random.randint(9, 14), random.randint(0, 59))))
        db.commit()
    print(f"Demo data ready.\n  Admin:   admin / {PW}\n  Teacher: T001 / {PW}\n  Student: BCA26001 / {PW}")


if __name__ == "__main__":
    main()
