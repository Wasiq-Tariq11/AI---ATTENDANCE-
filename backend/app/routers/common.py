import secrets
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import reports

DB = Annotated[Session, Depends(get_db)]


def temp_password() -> str:
    return secrets.token_urlsafe(9)


def commit(db: Session, msg="Duplicate value, or the record is still in use"):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, msg)


def flush_or_409(db: Session, msg: str):
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, msg)


def export(rows, fmt: str, name: str, title: str):
    if fmt == "pdf":
        return Response(reports.to_pdf(rows, title), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})
    return Response(reports.to_csv(rows), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


def export_table(headers, rows, fmt: str, name: str, title: str):
    if fmt == "pdf":
        return Response(reports.table_pdf(title, headers, rows), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})
    return Response(reports.table_csv(headers, rows), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})
