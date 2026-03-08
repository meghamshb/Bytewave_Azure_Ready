"""
Authentication module — JWT-based auth with bcrypt password hashing.

Uses the same SQLite database as the learning engine (learn.db).
Provides:
  - User registration (email + password) and guest accounts
  - Credential verification
  - JWT token creation and validation
  - FastAPI dependency for extracting the current user from a request
"""

from __future__ import annotations

import logging
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import bcrypt
import jwt

logger = logging.getLogger(__name__)

# ── Database (shared with learn.py) ──────────────────────────────────────────
_DB_PATH = Path(__file__).resolve().parent / "learn.db"


@contextmanager
def _db():
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ── JWT configuration ────────────────────────────────────────────────────────
_JWT_SECRET = os.environ.get("JWT_SECRET", "")
_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days

if not _JWT_SECRET:
    _JWT_SECRET = secrets.token_hex(32)
    logger.warning("No JWT_SECRET env var — using ephemeral secret (tokens won't survive restarts)")


# ── Schema ───────────────────────────────────────────────────────────────────

def init_auth_tables() -> None:
    with _db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id            TEXT PRIMARY KEY,
                email         TEXT UNIQUE,
                password_hash TEXT,
                name          TEXT DEFAULT 'Student',
                is_guest      INTEGER DEFAULT 0,
                created_at    REAL NOT NULL
            );
        """)
    logger.info("Auth tables initialised")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _generate_uid() -> str:
    return "usr_" + uuid.uuid4().hex[:12]


# ── User CRUD ────────────────────────────────────────────────────────────────

def create_user(email: str, password: str, name: str = "") -> dict:
    """Create a new user account. Raises ValueError if email already taken."""
    if not email or not password:
        raise ValueError("Email and password are required.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    email = email.lower().strip()
    display = name.strip() or email.split("@")[0]
    with _db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise ValueError("An account with that email already exists.")
        user_id = _generate_uid()
        pw_hash = _hash_password(password)
        conn.execute(
            "INSERT INTO users (id, email, password_hash, name, is_guest, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            (user_id, email, pw_hash, display, time.time()),
        )
    return {"id": user_id, "email": email, "name": display, "is_guest": False}


def authenticate_user(email: str, password: str) -> dict:
    """Verify credentials. Raises ValueError on failure."""
    if not email or not password:
        raise ValueError("Email and password are required.")
    email = email.lower().strip()
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        raise ValueError("Incorrect email or password.")
    if not _verify_password(password, row["password_hash"]):
        raise ValueError("Incorrect email or password.")
    return {"id": row["id"], "email": row["email"], "name": row["name"], "is_guest": False}


def create_guest() -> dict:
    """Create a guest user (no email/password)."""
    user_id = _generate_uid()
    with _db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, name, is_guest, created_at) VALUES (?, NULL, NULL, 'Student', 1, ?)",
            (user_id, time.time()),
        )
    return {"id": user_id, "email": None, "name": "Student", "is_guest": True}


def get_user_by_id(user_id: str) -> dict | None:
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return {"id": row["id"], "email": row["email"], "name": row["name"], "is_guest": bool(row["is_guest"])}


# ── JWT ──────────────────────────────────────────────────────────────────────

def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user.get("email"),
        "name": user.get("name", "Student"),
        "is_guest": user.get("is_guest", False),
        "exp": time.time() + _JWT_EXPIRY_SECONDS,
        "iat": time.time(),
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns user dict or None."""
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        return {
            "id": payload["sub"],
            "email": payload.get("email"),
            "name": payload.get("name", "Student"),
            "is_guest": payload.get("is_guest", False),
        }
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


# ── FastAPI helpers ──────────────────────────────────────────────────────────

def extract_user_from_request(authorization: str | None) -> dict | None:
    """Parse 'Bearer <token>' header and return user dict, or None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return verify_token(authorization[7:])
