import hashlib
import json
import sqlite3
import uuid
from pathlib import Path

from fastapi import HTTPException

from db import get_conn
from extract import extract_text_from_bytes, parse_document

UPLOAD_DIR = Path(__file__).parent / "uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def row_to_record(row):
    """Turn a database row into the Record object from our API contract."""
    extracted = json.loads(row["extracted_data"]) if row["extracted_data"] else {
        "doctor_name": None,
        "diagnoses": [],
        "medications": [],
        "lab_results": [],
        "warnings": [],
    }
    return {
        "id": row["id"],
        "patient_id": row["patient_id"],
        "document_type": row["document_type"],
        "document_date": row["document_date"],
        "source_name": row["source_name"],
        "extraction_status": row["extraction_status"],
        "original_filename": row["original_filename"],
        "import_source": row["import_source"],
        "created_at": row["created_at"],
        "verified": row["verified_at"] is not None,
        "verified_by": row["verified_by"],
        "verified_at": row["verified_at"],
        "extracted_data": extracted,
    }


def create_record_from_pdf(patient_id, data, original_filename, import_source="upload"):
    """Validate a PDF, reject duplicates, extract, store, and return a Record."""
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File is too large (max 10 MB)")
    if b"%PDF-" not in data[:1024]:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_hash = hashlib.sha256(data).hexdigest()

    conn = get_conn()
    try:
        existing = conn.execute(
            "SELECT id FROM records WHERE patient_id = ? AND file_hash = ?",
            (patient_id, file_hash),
        ).fetchone()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate document (already uploaded as record {existing['id']})",
            )

        try:
            text = extract_text_from_bytes(data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="No readable text found. Scanned PDFs are not supported yet",
            )

        parsed = parse_document(text)

        UPLOAD_DIR.mkdir(exist_ok=True)
        stored_name = f"{uuid.uuid4().hex}.pdf"
        (UPLOAD_DIR / stored_name).write_bytes(data)

        safe_filename = Path(original_filename or "document.pdf").name[:200]

        try:
            cur = conn.execute(
                """
                INSERT INTO records
                  (patient_id, document_type, document_date, source_name, extracted_data,
                   original_file_path, original_filename, extraction_status,
                   file_hash, import_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    patient_id,
                    parsed["document_type"],
                    parsed["document_date"],
                    parsed["source_name"],
                    json.dumps(parsed["extracted_data"]),
                    stored_name,
                    safe_filename,
                    parsed["extraction_status"],
                    file_hash,
                    import_source,
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            # Two identical uploads at the same moment: the database index caught it
            (UPLOAD_DIR / stored_name).unlink(missing_ok=True)
            raise HTTPException(status_code=409, detail="Duplicate document")

        row = conn.execute("SELECT * FROM records WHERE id = ?", (cur.lastrowid,)).fetchone()
        return row_to_record(row)
    finally:
        conn.close()