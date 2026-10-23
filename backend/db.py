import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "health.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _add_column_if_missing(conn, table, column, definition):
    cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    conn = get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS doctors (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        document_type TEXT,
        document_date TEXT,
        source_name TEXT,
        extracted_data TEXT,
        original_file_path TEXT,
        original_filename TEXT,
        extraction_status TEXT,
        file_hash TEXT,
        import_source TEXT DEFAULT 'upload',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS access_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        doctor_id INTEGER NOT NULL,
        permission_status TEXT NOT NULL,
        granted_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (patient_id) REFERENCES patients(id),
        FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    );

    -- Gmail (stretch feature). One connected account per patient.
    CREATE TABLE IF NOT EXISTS gmail_accounts (
        patient_id INTEGER PRIMARY KEY,
        email TEXT,
        token_json TEXT,
        connected_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    -- Remembers which email attachments were already imported.
    CREATE TABLE IF NOT EXISTS gmail_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        record_id INTEGER,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (patient_id, message_id, attachment_id)
    );
    """)

    # Upgrade an older health.db that was created before these columns existed
    _add_column_if_missing(conn, "records", "file_hash", "TEXT")
    _add_column_if_missing(conn, "records", "import_source", "TEXT DEFAULT 'upload'")

    # Same file can't be saved twice for the same patient (enforced by the database)
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_records_patient_hash
        ON records (patient_id, file_hash)
        WHERE file_hash IS NOT NULL
    """)

    # Seed demo users only if the tables are empty
    if conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0] == 0:
        conn.execute("INSERT INTO patients (id, name) VALUES (1, 'Demo Patient')")
    if conn.execute("SELECT COUNT(*) FROM doctors").fetchone()[0] == 0:
        conn.execute("INSERT INTO doctors (id, name) VALUES (1, 'Dr. Asha Rao')")
        conn.execute("INSERT INTO doctors (id, name) VALUES (2, 'Dr. Vikram Nair')")

    conn.commit()
    conn.close()