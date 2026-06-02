import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import List, Optional

from cryptography.fernet import Fernet

BASE_DIR   = os.path.dirname(os.path.dirname(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DB_PATH    = os.path.join(MODELS_DIR, "qboss_biometrics.db")
KEY_PATH   = os.path.join(MODELS_DIR, "db_key.key")

os.makedirs(MODELS_DIR, exist_ok=True)


def _load_or_create_key() -> bytes:
    if os.path.exists(KEY_PATH):
        with open(KEY_PATH, "rb") as f:
            return f.read()
    key = Fernet.generate_key()
    with open(KEY_PATH, "wb") as f:
        f.write(key)
    try:
        os.chmod(KEY_PATH, 0o600)
    except OSError:
        pass  # Windows uses ACL-based permissions; POSIX chmod is best-effort
    return key


_FERNET = Fernet(_load_or_create_key())


def encrypt(plaintext: bytes) -> str:
    return _FERNET.encrypt(plaintext).decode()


def decrypt(token: str) -> bytes:
    return _FERNET.decrypt(token.encode())


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE,
    display_name TEXT    DEFAULT '',
    created_at   TEXT    NOT NULL,
    is_active    INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS biometric_profiles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    modality    TEXT    NOT NULL,
    data_hash   TEXT    NOT NULL,
    data_blob   TEXT    NOT NULL,
    meta_json   TEXT    DEFAULT '{}',
    enrolled_at TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    version     INTEGER DEFAULT 1,
    UNIQUE(user_id, modality)
);

CREATE TABLE IF NOT EXISTS enrollment_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER,
    modality  TEXT    NOT NULL,
    action    TEXT    NOT NULL,
    success   INTEGER NOT NULL,
    timestamp TEXT    NOT NULL,
    detail    TEXT    DEFAULT ''
);
"""


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _conn() as con:
        con.executescript(_SCHEMA)


init_db()


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_user(username: str, display_name: str = "") -> dict:
    username = username.strip().lower()
    if not username:
        return {"success": False, "error": "Username cannot be empty"}
    try:
        with _conn() as con:
            cur = con.execute(
                "INSERT INTO users (username, display_name, created_at) VALUES (?,?,?)",
                (username, display_name.strip(), _utcnow()),
            )
            return {"success": True, "user_id": cur.lastrowid, "username": username}
    except sqlite3.IntegrityError:
        return {"success": False, "error": f"User '{username}' already exists"}


def get_user(user_id: int) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_name(username: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute(
            "SELECT * FROM users WHERE username=?", (username.strip().lower(),)
        ).fetchone()
    return dict(row) if row else None


def list_users() -> List[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT id, username, display_name, created_at, is_active FROM users ORDER BY id"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_user(user_id: int) -> bool:
    with _conn() as con:
        cur = con.execute("DELETE FROM users WHERE id=?", (user_id,))
    return cur.rowcount > 0


def save_biometric(user_id: int, modality: str, plaintext: bytes, meta: dict = None) -> None:
    meta = meta or {}
    blob     = encrypt(plaintext)
    h        = sha256_hex(plaintext)
    now      = _utcnow()
    meta_str = json.dumps(meta)

    with _conn() as con:
        existing = con.execute(
            "SELECT id FROM biometric_profiles WHERE user_id=? AND modality=?",
            (user_id, modality),
        ).fetchone()

        if existing:
            con.execute(
                "UPDATE biometric_profiles SET data_hash=?,data_blob=?,meta_json=?,updated_at=?,version=version+1 WHERE user_id=? AND modality=?",
                (h, blob, meta_str, now, user_id, modality),
            )
            action = "re-enroll"
        else:
            con.execute(
                "INSERT INTO biometric_profiles (user_id,modality,data_hash,data_blob,meta_json,enrolled_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                (user_id, modality, h, blob, meta_str, now, now),
            )
            action = "enroll"

        con.execute(
            "INSERT INTO enrollment_log (user_id,modality,action,success,timestamp) VALUES (?,?,?,?,?)",
            (user_id, modality, action, 1, now),
        )


def load_biometric(user_id: int, modality: str) -> Optional[bytes]:
    with _conn() as con:
        row = con.execute(
            "SELECT data_blob,data_hash FROM biometric_profiles WHERE user_id=? AND modality=?",
            (user_id, modality),
        ).fetchone()

    if row is None:
        return None

    plaintext = decrypt(row["data_blob"])
    if sha256_hex(plaintext) != row["data_hash"]:
        raise ValueError(f"Integrity check failed for user={user_id} modality='{modality}'")
    return plaintext


def is_enrolled(user_id: int, modality: str) -> bool:
    with _conn() as con:
        row = con.execute(
            "SELECT 1 FROM biometric_profiles WHERE user_id=? AND modality=?",
            (user_id, modality),
        ).fetchone()
    return row is not None


def get_meta(user_id: int, modality: str) -> dict:
    with _conn() as con:
        row = con.execute(
            "SELECT meta_json,enrolled_at,updated_at,version FROM biometric_profiles WHERE user_id=? AND modality=?",
            (user_id, modality),
        ).fetchone()
    if row is None:
        return {}
    return {
        "modality":    modality,
        "enrolled_at": row["enrolled_at"],
        "updated_at":  row["updated_at"],
        "version":     row["version"],
        **json.loads(row["meta_json"]),
    }


def delete_biometric(user_id: int, modality: str) -> bool:
    with _conn() as con:
        cur = con.execute(
            "DELETE FROM biometric_profiles WHERE user_id=? AND modality=?",
            (user_id, modality),
        )
        if cur.rowcount:
            con.execute(
                "INSERT INTO enrollment_log (user_id,modality,action,success,timestamp) VALUES (?,?,?,?,?)",
                (user_id, modality, "delete", 1, _utcnow()),
            )
    return cur.rowcount > 0


def log_verification(user_id: int, modality: str, success: bool, detail: str = "") -> None:
    with _conn() as con:
        con.execute(
            "INSERT INTO enrollment_log (user_id,modality,action,success,timestamp,detail) VALUES (?,?,?,?,?,?)",
            (user_id, modality, "verify", int(success), _utcnow(), detail),
        )


def get_audit_log(limit: int = 100, user_id: int = None) -> List[dict]:
    with _conn() as con:
        if user_id is not None:
            rows = con.execute(
                "SELECT l.*,u.username FROM enrollment_log l LEFT JOIN users u ON l.user_id=u.id WHERE l.user_id=? ORDER BY l.id DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT l.*,u.username FROM enrollment_log l LEFT JOIN users u ON l.user_id=u.id ORDER BY l.id DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


def get_user_enrollment_status(user_id: int) -> dict:
    return {m: is_enrolled(user_id, m) for m in ("face", "hand", "gesture", "voice")}


def get_all_users_with_status() -> List[dict]:
    users = list_users()
    for u in users:
        u["enrolled"] = get_user_enrollment_status(u["id"])
        u["enrolled_count"] = sum(u["enrolled"].values())
    return users
