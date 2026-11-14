"""Create the first administrator.  Run:  python -m app.scripts.create_admin"""
from getpass import getpass

from sqlalchemy import select

from ..database import Base, SessionLocal, engine
from ..models.tables import User
from ..security import hash_password


def main():
    Base.metadata.create_all(bind=engine)
    username = input("Admin username: ").strip()
    full_name = input("Full name: ").strip()
    password = getpass("Password (min 10 chars): ")
    if len(password) < 10 or password != getpass("Repeat password: "):
        raise SystemExit("Passwords must match and be at least 10 characters.")
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == username)):
            raise SystemExit("That username already exists.")
        db.add(User(username=username, full_name=full_name, role="admin",
                    password_hash=hash_password(password)))
        db.commit()
    print("Admin created.")


if __name__ == "__main__":
    main()
