import re
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from access import check_patient_access, doctor_has_access
from auth import get_current_user, login_user
from db import get_conn, init_db
from records import UPLOAD_DIR, create_record_from_pdf, row_to_record

VALID_TYPES = {"consultation", "lab_report", "prescription", "imaging", "unknown"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Unified Patient Health Records", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    role: str
    user_id: int


class AccessRequest(BaseModel):
    doctor_id: int


# ------------------------------------------------------------------ helpers

def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _require_role(user, role, message):
    if user["role"] != role:
        raise HTTPException(status_code=403, detail=message)


def _valid_date(value, field_name):
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a real date like 2026-04-15")


def _search_text(record):
    """All the text a keyword search should look through for one record."""
    data = record["extracted_data"]
    parts = [record["source_name"], data.get("doctor_name")]
    parts += data.get("diagnoses", [])
    parts += [m.get("name") for m in data.get("medications", [])]
    parts += [t.get("test") for t in data.get("lab_results", [])]
    return " ".join(p for p in parts if p).lower()


def _get_record_row(conn, record_id, user):
    row = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")
    check_patient_access(conn, user, row["patient_id"])
    return row


def _latest_status(conn, patient_id, doctor_id):
    """'granted', 'revoked' or 'none' for this patient-doctor pair."""
    row = conn.execute(
        """
        SELECT permission_status FROM access_permissions
        WHERE patient_id = ? AND doctor_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (patient_id, doctor_id),
    ).fetchone()
    return row["permission_status"] if row else "none"


def _doctor_exists(conn, doctor_id):
    return conn.execute("SELECT 1 FROM doctors WHERE id = ?", (doctor_id,)).fetchone() is not None


def _set_verification(record_id, user, verify):
    conn = get_conn()
    try:
        row = _get_record_row(conn, record_id, user)
        if verify:
            if row["extraction_status"] == "failed":
                raise HTTPException(
                    status_code=400,
                    detail="Nothing was extracted from this document, so there is nothing to verify",
                )
            conn.execute(
                "UPDATE records SET verified_by = ?, verified_at = ? WHERE id = ?",
                (f"{user['name']} ({user['role']})", _now(), record_id),
            )
        else:
            conn.execute(
                "UPDATE records SET verified_by = NULL, verified_at = NULL WHERE id = ?",
                (record_id,),
            )
        conn.commit()
        updated = conn.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone()
        return row_to_record(updated)
    finally:
        conn.close()


# ------------------------------------------------------------------- routes

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
def login(body: LoginRequest):
    return login_user(body.role, body.user_id)


@app.get("/doctors")
def list_doctors(user=Depends(get_current_user)):
    _require_role(user, "patient", "Only patients can list doctors")
    conn = get_conn()
    rows = conn.execute("SELECT id, name FROM doctors ORDER BY id").fetchall()
    conn.close()
    return [{"id": r["id"], "name": r["name"]} for r in rows]


@app.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), user=Depends(get_current_user)):
    _require_role(user, "patient", "Only patients can upload documents")
    data = await file.read()
    return create_record_from_pdf(user["user_id"], data, file.filename)


@app.get("/patients/{patient_id}/records")
def list_patient_records(
    patient_id: int,
    doc_type: Optional[str] = Query(None, alias="type"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    user=Depends(get_current_user),
):
    conn = get_conn()
    try:
        check_patient_access(conn, user, patient_id)

        sql = "SELECT * FROM records WHERE patient_id = ?"
        params = [patient_id]

        if doc_type:
            if doc_type not in VALID_TYPES:
                raise HTTPException(
                    status_code=400, detail=f"type must be one of: {', '.join(sorted(VALID_TYPES))}"
                )
            sql += " AND document_type = ?"
            params.append(doc_type)
        if date_from:
            _valid_date(date_from, "date_from")
            sql += " AND document_date >= ?"
            params.append(date_from)
        if date_to:
            _valid_date(date_to, "date_to")
            sql += " AND document_date <= ?"
            params.append(date_to)

        # Oldest first; records with no date go last
        sql += " ORDER BY document_date IS NULL, document_date ASC, id ASC"

        records = [row_to_record(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()

    if q and q.strip():
        needle = q.strip().lower()
        records = [r for r in records if needle in _search_text(r)]
    return records


@app.get("/records/{record_id}")
def get_record(record_id: int, user=Depends(get_current_user)):
    conn = get_conn()
    try:
        return row_to_record(_get_record_row(conn, record_id, user))
    finally:
        conn.close()


@app.get("/records/{record_id}/document")
def get_record_document(record_id: int, user=Depends(get_current_user)):
    conn = get_conn()
    try:
        row = _get_record_row(conn, record_id, user)
    finally:
        conn.close()

    path = UPLOAD_DIR / row["original_file_path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Original document file is missing")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=row["original_filename"],
        content_disposition_type="inline",
    )


@app.post("/records/{record_id}/verify")
def verify_record(record_id: int, user=Depends(get_current_user)):
    return _set_verification(record_id, user, True)


@app.post("/records/{record_id}/unverify")
def unverify_record(record_id: int, user=Depends(get_current_user)):
    return _set_verification(record_id, user, False)


# ----------------------------------------------------------- access control

@app.get("/access")
def list_access(user=Depends(get_current_user)):
    _require_role(user, "patient", "Only patients can view access settings")
    conn = get_conn()
    try:
        doctors = conn.execute("SELECT id, name FROM doctors ORDER BY id").fetchall()
        return [
            {
                "doctor_id": d["id"],
                "doctor_name": d["name"],
                "status": _latest_status(conn, user["user_id"], d["id"]),
            }
            for d in doctors
        ]
    finally:
        conn.close()


@app.post("/access/grant")
def grant_access(body: AccessRequest, user=Depends(get_current_user)):
    _require_role(user, "patient", "Only patients can grant access")
    conn = get_conn()
    try:
        if not _doctor_exists(conn, body.doctor_id):
            raise HTTPException(status_code=404, detail=f"No doctor with id {body.doctor_id}")
        # Already granted: do nothing (avoids duplicate rows on double-click)
        if _latest_status(conn, user["user_id"], body.doctor_id) != "granted":
            conn.execute(
                """
                INSERT INTO access_permissions (patient_id, doctor_id, permission_status, granted_at)
                VALUES (?, ?, 'granted', ?)
                """,
                (user["user_id"], body.doctor_id, _now()),
            )
            conn.commit()
        return {"doctor_id": body.doctor_id, "status": "granted"}
    finally:
        conn.close()


@app.post("/access/revoke")
def revoke_access(body: AccessRequest, user=Depends(get_current_user)):
    _require_role(user, "patient", "Only patients can revoke access")
    conn = get_conn()
    try:
        if not _doctor_exists(conn, body.doctor_id):
            raise HTTPException(status_code=404, detail=f"No doctor with id {body.doctor_id}")
        conn.execute(
            """
            UPDATE access_permissions
            SET permission_status = 'revoked', revoked_at = ?
            WHERE patient_id = ? AND doctor_id = ? AND permission_status = 'granted'
            """,
            (_now(), user["user_id"], body.doctor_id),
        )
        conn.commit()
        return {"doctor_id": body.doctor_id, "status": "revoked"}
    finally:
        conn.close()


@app.get("/doctors/patients")
def list_doctor_patients(user=Depends(get_current_user)):
    _require_role(user, "doctor", "Only doctors can list their patients")
    conn = get_conn()
    try:
        patients = conn.execute("SELECT id, name FROM patients ORDER BY id").fetchall()
        return [
            {"id": p["id"], "name": p["name"]}
            for p in patients
            if doctor_has_access(conn, p["id"], user["user_id"])
        ]
    finally:
        conn.close()