import secrets
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import get_conn

# Makes the green "Authorize" button appear on the /docs page
bearer_scheme = HTTPBearer(auto_error=False)

# token -> {"role": "patient" | "doctor", "user_id": int, "name": str}
# In memory only: restarting the server logs everyone out.
TOKENS = {}


def login_user(role: str, user_id: int):
    if role not in ("patient", "doctor"):
        raise HTTPException(status_code=400, detail="role must be 'patient' or 'doctor'")

    table = "patients" if role == "patient" else "doctors"
    conn = get_conn()
    row = conn.execute(f"SELECT id, name FROM {table} WHERE id = ?", (user_id,)).fetchone()
    conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"No {role} with id {user_id}")

    token = secrets.token_hex(16)
    TOKENS[token] = {"role": role, "user_id": row["id"], "name": row["name"]}
    return {"token": token, "role": role, "user_id": row["id"], "name": row["name"]}


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """Use as a dependency: Depends(get_current_user)"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    user = TOKENS.get(credentials.credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user