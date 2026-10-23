from fastapi import HTTPException


def doctor_has_access(conn, patient_id, doctor_id):
    """A doctor has access only if the patient's latest permission row says 'granted'."""
    row = conn.execute(
        """
        SELECT permission_status FROM access_permissions
        WHERE patient_id = ? AND doctor_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (patient_id, doctor_id),
    ).fetchone()
    return row is not None and row["permission_status"] == "granted"


def check_patient_access(conn, user, patient_id):
    """Raises 403 unless this user may see this patient's data."""
    if user["role"] == "patient":
        if user["user_id"] != patient_id:
            raise HTTPException(status_code=403, detail="You can only view your own records")
    elif user["role"] == "doctor":
        if not doctor_has_access(conn, patient_id, user["user_id"]):
            raise HTTPException(
                status_code=403, detail="You do not have access to this patient's records"
            )
    else:
        raise HTTPException(status_code=403, detail="Not allowed")