from __future__ import annotations

import json
import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import wraps
from hashlib import sha256
from threading import RLock
from typing import Any

from .db import transaction, utc_now_iso
from .security import compare_token_hash, hash_token


SESSION_TTL_HOURS = max(int(os.environ.get("MEDLIFE_SESSION_ABSOLUTE_HOURS", "12")), 1)
SESSION_IDLE_MINUTES = max(int(os.environ.get("MEDLIFE_SESSION_IDLE_MINUTES", "240")), 5)
MAX_ACTIVE_SESSIONS = max(int(os.environ.get("MEDLIFE_MAX_ACTIVE_SESSIONS", "5")), 1)
MAX_EVENT_PAYLOAD_BYTES = max(int(os.environ.get("MEDLIFE_MAX_EVENT_PAYLOAD_BYTES", "200000")), 10_000)
_DB_LOCK = RLock()


def with_db_lock(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        with _DB_LOCK:
            return fn(*args, **kwargs)

    return wrapper


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=True)


def json_loads(raw: str | None) -> Any:
    return json.loads(raw) if raw else None


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def _idle_expiry_from(base: datetime) -> str:
    return (base + timedelta(minutes=SESSION_IDLE_MINUTES)).replace(microsecond=0).isoformat()


def _absolute_expiry_from(base: datetime) -> str:
    return (base + timedelta(hours=SESSION_TTL_HOURS)).replace(microsecond=0).isoformat()


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _enforce_payload_size(payload: Any) -> None:
    if len(json_dumps(payload).encode("utf-8")) > MAX_EVENT_PAYLOAD_BYTES:
        raise ValueError("payload_too_large")


@dataclass
class SessionRecord:
    id: str
    user_id: str
    expires_at: str
    csrf_token: str


@with_db_lock
def create_user(conn: sqlite3.Connection, *, email: str, display_name: str, password_hash: str, password_salt: str) -> dict[str, Any]:
    user_id = f"user-{uuid.uuid4()}"
    now = utc_now_iso()
    with transaction(conn, immediate=True):
        conn.execute(
            """
            INSERT INTO users (
                id, email, email_normalized, display_name, password_hash, password_salt,
                status, created_at, updated_at, password_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
            """,
            (
                user_id,
                email.strip(),
                normalize_email(email),
                display_name.strip(),
                password_hash,
                password_salt,
                now,
                now,
                now,
            ),
        )
    return get_user_by_id(conn, user_id)


@with_db_lock
def update_user_password(conn: sqlite3.Connection, *, user_id: str, password_hash: str, password_salt: str) -> None:
    now = utc_now_iso()
    with transaction(conn, immediate=True):
        conn.execute(
            """
            UPDATE users
            SET password_hash = ?, password_salt = ?, password_updated_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (password_hash, password_salt, now, now, user_id),
        )


@with_db_lock
def get_user_by_email(conn: sqlite3.Connection, email: str) -> dict[str, Any] | None:
    return row_to_dict(
        conn.execute(
            "SELECT * FROM users WHERE email_normalized = ?",
            (normalize_email(email),),
        ).fetchone()
    )


@with_db_lock
def get_user_by_id(conn: sqlite3.Connection, user_id: str) -> dict[str, Any] | None:
    return row_to_dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


@with_db_lock
def record_security_audit_event(
    conn: sqlite3.Connection,
    *,
    event_type: str,
    event_status: str,
    user_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    with transaction(conn, immediate=True):
        conn.execute(
            """
            INSERT INTO security_audit_events (
                id, user_id, event_type, event_status, ip_address, user_agent, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"audit-{uuid.uuid4()}",
                user_id,
                event_type,
                event_status,
                (ip_address or "")[:64] or None,
                (user_agent or "")[:255] or None,
                json_dumps(metadata or {}),
                utc_now_iso(),
            ),
        )


@with_db_lock
def create_session(conn: sqlite3.Connection, *, user_id: str, raw_session_token: str, raw_csrf_token: str, user_agent: str | None) -> SessionRecord:
    session_id = f"sess-{uuid.uuid4()}"
    created_at = now_utc()
    now_iso = created_at.replace(microsecond=0).isoformat()
    expires_iso = _absolute_expiry_from(created_at)
    idle_expires_iso = _idle_expiry_from(created_at)
    with transaction(conn, immediate=True):
        conn.execute(
            """
            INSERT INTO sessions (
                id, user_id, session_token_hash, csrf_token_hash,
                created_at, expires_at, idle_expires_at, user_agent, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user_id,
                hash_token(raw_session_token),
                hash_token(raw_csrf_token),
                now_iso,
                expires_iso,
                idle_expires_iso,
                (user_agent or "")[:255],
                now_iso,
            ),
        )
        conn.execute(
            "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
            (now_iso, now_iso, user_id),
        )
        active_ids = conn.execute(
            """
            SELECT id
            FROM sessions
            WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
            ORDER BY last_seen_at DESC, created_at DESC
            """,
            (user_id, now_iso),
        ).fetchall()
        if len(active_ids) > MAX_ACTIVE_SESSIONS:
            for row in active_ids[MAX_ACTIVE_SESSIONS:]:
                conn.execute(
                    "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
                    (now_iso, row["id"]),
                )
    return SessionRecord(id=session_id, user_id=user_id, expires_at=expires_iso, csrf_token=raw_csrf_token)


@with_db_lock
def revoke_session(conn: sqlite3.Connection, raw_session_token: str) -> bool:
    now = utc_now_iso()
    with transaction(conn, immediate=True):
        cur = conn.execute(
            "UPDATE sessions SET revoked_at = ? WHERE session_token_hash = ? AND revoked_at IS NULL",
            (now, hash_token(raw_session_token)),
        )
    return cur.rowcount > 0


@with_db_lock
def revoke_all_sessions_for_user(conn: sqlite3.Connection, user_id: str, *, except_session_id: str | None = None) -> int:
    now = utc_now_iso()
    sql = "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
    params: list[Any] = [now, user_id]
    if except_session_id:
        sql += " AND id != ?"
        params.append(except_session_id)
    with transaction(conn, immediate=True):
        cur = conn.execute(sql, tuple(params))
    return cur.rowcount


@with_db_lock
def get_session_with_user(conn: sqlite3.Connection, raw_session_token: str) -> dict[str, Any] | None:
    now_dt = now_utc().replace(microsecond=0)
    now = now_dt.isoformat()
    rows = conn.execute(
        """
        SELECT
            s.id AS session_id,
            s.user_id AS session_user_id,
            s.session_token_hash,
            s.expires_at,
            s.idle_expires_at,
            s.csrf_token_hash,
            s.revoked_at,
            s.created_at,
            s.last_seen_at,
            u.id AS user_id,
            u.email,
            u.display_name,
            u.status,
            u.created_at,
            u.updated_at,
            u.last_login_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.revoked_at IS NULL
        """
    ).fetchall()
    item: dict[str, Any] | None = None
    for row in rows:
        candidate = row_to_dict(row)
        if candidate and compare_token_hash(raw_session_token, str(candidate["session_token_hash"])):
            item = candidate
            break
    if not item:
        return None
    expires_at = _parse_iso(item["expires_at"])
    idle_expires_at = _parse_iso(item.get("idle_expires_at") or item["expires_at"])
    if expires_at <= now_dt or idle_expires_at <= now_dt:
        with transaction(conn, immediate=True):
            conn.execute("UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?", (now, item["session_id"]))
        return None
    with transaction(conn, immediate=True):
        conn.execute(
            "UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?",
            (now, _idle_expiry_from(now_dt), item["session_id"]),
        )
    return item


def verify_csrf(session_row: dict[str, Any], csrf_token: str) -> bool:
    return compare_token_hash(csrf_token, str(session_row["csrf_token_hash"]))


@with_db_lock
def create_encounter(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    encounter_id: str,
    case_id: str,
    case_version: str,
    case_name: str,
    case_status: str,
    approval_status: str,
    review_banner: str,
    conversation_mode: str,
    integrity_status: str,
    draft_snapshot: dict[str, Any],
) -> dict[str, Any]:
    _enforce_payload_size(draft_snapshot)
    now = utc_now_iso()
    with transaction(conn, immediate=True):
        existing = conn.execute(
            "SELECT * FROM encounters WHERE id = ? AND user_id = ?",
            (encounter_id, user_id),
        ).fetchone()
        if existing:
            item = row_to_dict(existing) or {}
            item["draft_snapshot"] = json_loads(item.pop("draft_snapshot_json", None))
            item["completion_snapshot"] = json_loads(item.pop("completion_snapshot_json", None))
            return item
        conn.execute(
            """
            INSERT INTO encounters (
                id, user_id, case_id, case_version, case_name, case_status, approval_status,
                review_banner, conversation_mode, status, integrity_status,
                started_at, last_activity_at, draft_snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?)
            """,
            (
                encounter_id,
                user_id,
                case_id,
                case_version,
                case_name,
                case_status,
                approval_status,
                review_banner,
                conversation_mode,
                integrity_status,
                now,
                now,
                json_dumps(draft_snapshot),
            ),
        )
    return get_encounter_for_user(conn, encounter_id, user_id)


@with_db_lock
def get_encounter_for_user(conn: sqlite3.Connection, encounter_id: str, user_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM encounters WHERE id = ? AND user_id = ?",
        (encounter_id, user_id),
    ).fetchone()
    item = row_to_dict(row)
    if not item:
        return None
    item["draft_snapshot"] = json_loads(item.pop("draft_snapshot_json", None))
    item["completion_snapshot"] = json_loads(item.pop("completion_snapshot_json", None))
    return item


@with_db_lock
def list_encounters_for_user(conn: sqlite3.Connection, user_id: str, *, status: str | None = None) -> list[dict[str, Any]]:
    params: list[Any] = [user_id]
    sql = "SELECT * FROM encounters WHERE user_id = ?"
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY last_activity_at DESC"
    rows = conn.execute(sql, tuple(params)).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = row_to_dict(row) or {}
        item["draft_snapshot"] = json_loads(item.pop("draft_snapshot_json", None))
        item["completion_snapshot"] = json_loads(item.pop("completion_snapshot_json", None))
        items.append(item)
    return items


@with_db_lock
def append_event(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    encounter_id: str,
    event_id: str,
    idempotency_key: str,
    sequence_number: int,
    event_type: str,
    payload: dict[str, Any],
    draft_snapshot: dict[str, Any],
    integrity_status: str,
) -> dict[str, Any]:
    _enforce_payload_size(payload)
    _enforce_payload_size(draft_snapshot)
    now = utc_now_iso()
    with transaction(conn, immediate=True):
        encounter = conn.execute(
            "SELECT * FROM encounters WHERE id = ? AND user_id = ?",
            (encounter_id, user_id),
        ).fetchone()
        if not encounter:
            raise KeyError("encounter_not_found")
        if encounter["status"] != "in_progress":
            raise ValueError("encounter_completed")
        duplicate = conn.execute(
            "SELECT * FROM encounter_events WHERE encounter_id = ? AND idempotency_key = ?",
            (encounter_id, idempotency_key),
        ).fetchone()
        if duplicate:
            return row_to_dict(duplicate) or {}
        expected_next = conn.execute(
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM encounter_events WHERE encounter_id = ?",
            (encounter_id,),
        ).fetchone()
        next_seq = int(expected_next["next_seq"]) if expected_next else 1
        if sequence_number != next_seq:
            raise RuntimeError("invalid_sequence")
        conn.execute(
            """
            INSERT INTO encounter_events (
                id, encounter_id, user_id, idempotency_key, sequence_number,
                event_type, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                encounter_id,
                user_id,
                idempotency_key,
                sequence_number,
                event_type,
                json_dumps(payload),
                now,
            ),
        )
        conn.execute(
            """
            UPDATE encounters
            SET last_activity_at = ?, draft_snapshot_json = ?, integrity_status = ?, optimistic_version = optimistic_version + 1
            WHERE id = ? AND user_id = ?
            """,
            (
                now,
                json_dumps(draft_snapshot),
                integrity_status,
                encounter_id,
                user_id,
            ),
        )
    created = conn.execute("SELECT * FROM encounter_events WHERE id = ?", (event_id,)).fetchone()
    return row_to_dict(created) or {}


@with_db_lock
def upsert_assessment_and_complete(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    encounter_id: str,
    completion_snapshot: dict[str, Any],
    integrity_status: str,
    engine: str,
    assessment_status: str,
    case_id: str,
    case_version: str,
    evaluation: dict[str, Any],
    evidence_refs: list[dict[str, Any]],
    receipts: list[dict[str, Any]],
) -> dict[str, Any]:
    _enforce_payload_size(completion_snapshot)
    _enforce_payload_size(evaluation)
    _enforce_payload_size(evidence_refs)
    _enforce_payload_size(receipts)
    encounter = conn.execute(
        "SELECT * FROM encounters WHERE id = ? AND user_id = ?",
        (encounter_id, user_id),
    ).fetchone()
    if not encounter:
        raise KeyError("encounter_not_found")
    now = utc_now_iso()
    assessment_id = f"asm-{encounter_id}"
    with transaction(conn, immediate=True):
        conn.execute(
            """
            UPDATE encounters
            SET status = 'completed',
                integrity_status = ?,
                completed_at = COALESCE(completed_at, ?),
                submitted_at = COALESCE(submitted_at, ?),
                assessment_engine = ?,
                last_activity_at = ?,
                completion_snapshot_json = ?,
                optimistic_version = optimistic_version + 1
            WHERE id = ? AND user_id = ?
            """,
            (
                integrity_status,
                now,
                now,
                engine,
                now,
                json_dumps(completion_snapshot),
                encounter_id,
                user_id,
            ),
        )
        conn.execute(
            """
            INSERT INTO assessments (
                id, encounter_id, user_id, engine, status, case_id, case_version,
                assessment_schema_version, integrity_status, evaluation_json,
                evidence_refs_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'round2c-v1', ?, ?, ?, ?, ?)
            ON CONFLICT(encounter_id) DO UPDATE SET
                engine = excluded.engine,
                status = excluded.status,
                integrity_status = excluded.integrity_status,
                evaluation_json = excluded.evaluation_json,
                evidence_refs_json = excluded.evidence_refs_json,
                updated_at = excluded.updated_at
            """,
            (
                assessment_id,
                encounter_id,
                user_id,
                engine,
                assessment_status,
                case_id,
                case_version,
                integrity_status,
                json_dumps(evaluation),
                json_dumps(evidence_refs),
                now,
                now,
            ),
        )
        for receipt in receipts:
            receipt_id = f"dbrec-{encounter_id}-{receipt['receiptId']}"
            conn.execute(
                """
                INSERT INTO disclosure_receipts (
                    id, encounter_id, receipt_id, validation_status, created_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(encounter_id, receipt_id) DO UPDATE SET
                    validation_status = excluded.validation_status,
                    payload_json = excluded.payload_json
                """,
                (
                    receipt_id,
                    encounter_id,
                    receipt["receiptId"],
                    receipt.get("status", "verified"),
                    now,
                    json_dumps(receipt),
                ),
            )
    return get_completed_attempt(conn, encounter_id, user_id) or {}


@with_db_lock
def get_completed_attempt(conn: sqlite3.Connection, encounter_id: str, user_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT
            e.*,
            a.engine AS assessment_engine_value,
            a.status AS assessment_status,
            a.evaluation_json,
            a.evidence_refs_json
        FROM encounters e
        LEFT JOIN assessments a ON a.encounter_id = e.id
        WHERE e.id = ? AND e.user_id = ?
        """,
        (encounter_id, user_id),
    ).fetchone()
    item = row_to_dict(row)
    if not item:
        return None
    item["draft_snapshot"] = json_loads(item.pop("draft_snapshot_json", None))
    item["completion_snapshot"] = json_loads(item.pop("completion_snapshot_json", None))
    item["evaluation"] = json_loads(item.pop("evaluation_json", None))
    item["evidence_refs"] = json_loads(item.pop("evidence_refs_json", None)) or []
    return item


@with_db_lock
def list_attempts_for_user(conn: sqlite3.Connection, user_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
            e.*,
            a.engine AS assessment_engine_value,
            a.status AS assessment_status,
            a.evaluation_json
        FROM encounters e
        LEFT JOIN assessments a ON a.encounter_id = e.id
        WHERE e.user_id = ?
        ORDER BY COALESCE(e.completed_at, e.last_activity_at) DESC
        """,
        (user_id,),
    ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = row_to_dict(row) or {}
        item["draft_snapshot"] = json_loads(item.pop("draft_snapshot_json", None))
        item["completion_snapshot"] = json_loads(item.pop("completion_snapshot_json", None))
        item["evaluation"] = json_loads(item.pop("evaluation_json", None))
        items.append(item)
    return items


@with_db_lock
def export_user_data(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    user = get_user_by_id(conn, user_id)
    attempts = list_attempts_for_user(conn, user_id)
    if not user:
        raise KeyError("user_not_found")
    profile = {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "status": user["status"],
        "created_at": user["created_at"],
        "last_login_at": user.get("last_login_at"),
    }
    return {
        "exported_at": utc_now_iso(),
        "profile": profile,
        "encounters": attempts,
        "progress": compute_progress(attempts),
    }


def migration_fingerprint(entry: dict[str, Any]) -> str:
    source = "|".join(
        [
            str(entry.get("encounterId", "")),
            str(entry.get("caseId", "")),
            str(entry.get("savedAt", "")),
            str(entry.get("verdict", "")),
        ]
    )
    return sha256(source.encode("utf-8")).hexdigest()


@with_db_lock
def import_local_attempt(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    entry: dict[str, Any],
    mapped_integrity_status: str,
) -> dict[str, Any]:
    fingerprint = migration_fingerprint(entry)
    source_encounter_id = str(entry.get("encounterId") or entry.get("id") or f"legacy-{uuid.uuid4()}")
    existing = conn.execute(
        "SELECT * FROM local_history_migrations WHERE user_id = ? AND fingerprint = ?",
        (user_id, fingerprint),
    ).fetchone()
    if existing:
        existing_row = row_to_dict(existing) or {}
        if existing_row.get("result_encounter_id"):
            return get_completed_attempt(conn, existing_row["result_encounter_id"], user_id) or existing_row
        return existing_row

    encounter_id = f"migrated-{source_encounter_id}"
    now = utc_now_iso()
    patient_snapshot = entry.get("patientSnapshot") or {}
    receipts = list((patient_snapshot.get("disclosureReceipts") or []))
    evidence_refs = [
        {
            "receiptId": receipt.get("receiptId"),
            "learnerMessageId": receipt.get("learnerMessageId"),
            "patientMessageId": receipt.get("patientMessageId"),
            "verifiedFactIds": receipt.get("verifiedDisclosedFactIds") or [],
        }
        for receipt in receipts
    ]
    completion_snapshot = patient_snapshot if patient_snapshot else {
        "encounterId": source_encounter_id,
        "case": {
            "id": entry.get("caseId"),
            "caseVersion": "unknown",
            "name": entry.get("caseName"),
            "status": "development_only",
            "approvalStatus": "clinical_review_required",
            "reviewBanner": "Imported from anonymous local history.",
        },
        "transcript": [],
        "disclosureReceipts": receipts,
    }
    with transaction(conn, immediate=True):
        conn.execute(
            """
            INSERT INTO local_history_migrations (
                id, user_id, fingerprint, source_encounter_id, result_encounter_id, status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'imported', ?)
            """,
            (f"mig-{uuid.uuid4()}", user_id, fingerprint, source_encounter_id, encounter_id, now),
        )
        conn.execute(
            """
            INSERT INTO encounters (
                id, user_id, case_id, case_version, case_name, case_status, approval_status,
                review_banner, conversation_mode, status, integrity_status, started_at,
                last_activity_at, completed_at, submitted_at, assessment_engine,
                draft_snapshot_json, completion_snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                encounter_id,
                user_id,
                entry.get("caseId"),
                completion_snapshot.get("case", {}).get("caseVersion", "unknown"),
                entry.get("caseName"),
                completion_snapshot.get("case", {}).get("status", "development_only"),
                completion_snapshot.get("case", {}).get("approvalStatus", "clinical_review_required"),
                completion_snapshot.get("case", {}).get("reviewBanner", "Imported from anonymous local history."),
                completion_snapshot.get("conversationMode", "guided"),
                mapped_integrity_status,
                entry.get("savedAt", now),
                entry.get("savedAt", now),
                entry.get("savedAt", now),
                entry.get("savedAt", now),
                entry.get("engine", "saved"),
                json_dumps(completion_snapshot),
                json_dumps(completion_snapshot),
            ),
        )
        conn.execute(
            """
            INSERT INTO assessments (
                id, encounter_id, user_id, engine, status, case_id, case_version,
                assessment_schema_version, integrity_status, evaluation_json,
                evidence_refs_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'completed', ?, ?, 'round2c-v1', ?, ?, ?, ?, ?)
            """,
            (
                f"asm-{encounter_id}",
                encounter_id,
                user_id,
                entry.get("engine", "saved"),
                entry.get("caseId"),
                completion_snapshot.get("case", {}).get("caseVersion", "unknown"),
                mapped_integrity_status,
                json_dumps(entry.get("evaluation") or {}),
                json_dumps(evidence_refs),
                entry.get("savedAt", now),
                now,
            ),
        )
        for receipt in receipts:
            conn.execute(
                """
                INSERT INTO disclosure_receipts (
                    id, encounter_id, receipt_id, validation_status, created_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"dbrec-{encounter_id}-{receipt.get('receiptId', uuid.uuid4())}",
                    encounter_id,
                    receipt.get("receiptId", f"legacy-{uuid.uuid4()}"),
                    "migrated_legacy",
                    now,
                    json_dumps(receipt),
                ),
            )
    return get_completed_attempt(conn, encounter_id, user_id) or {}


@with_db_lock
def delete_encounter_for_user(conn: sqlite3.Connection, encounter_id: str, user_id: str) -> bool:
    with transaction(conn, immediate=True):
        cur = conn.execute("DELETE FROM encounters WHERE id = ? AND user_id = ?", (encounter_id, user_id))
    return cur.rowcount > 0


def compute_progress(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    completed = [item for item in attempts if item.get("status") == "completed" and item.get("evaluation")]
    if not completed:
        return {
            "attempts_completed": 0,
            "recent_scores": [],
            "domain_averages": {},
            "recent_trend": "not_enough_data",
            "frequently_missed_history_domains": [],
            "safety_critical_omissions": 0,
            "specialty_coverage": {},
            "cases_attempted": 0,
        }

    domain_totals: dict[str, float] = {}
    domain_counts: dict[str, int] = {}
    recent_scores: list[dict[str, Any]] = []
    missed_domains: dict[str, int] = {}
    specialty_coverage: dict[str, int] = {}
    safety_critical = 0
    for item in completed:
        evaluation = item.get("evaluation") or {}
        recent_scores.append(
            {
                "encounter_id": item["id"],
                "case_id": item["case_id"],
                "saved_at": item.get("completed_at") or item.get("last_activity_at"),
                "verdict": evaluation.get("global_rating"),
            }
        )
        domain_scores = evaluation.get("domain_scores") or {}
        for key, score in domain_scores.items():
            if not isinstance(score, dict):
                continue
            raw = float(score.get("raw") or 0)
            max_value = float(score.get("max") or 1)
            domain_totals[key] = domain_totals.get(key, 0.0) + (raw / max_value if max_value else 0.0)
            domain_counts[key] = domain_counts.get(key, 0) + 1
        for criterion in evaluation.get("criteria") or []:
            if criterion.get("domain") == "data_gathering" and criterion.get("verdict") == "missed":
                missed_domains[criterion.get("criterion_id", "unknown")] = missed_domains.get(criterion.get("criterion_id", "unknown"), 0) + 1
        if evaluation.get("safety_breach"):
            safety_critical += 1
        specialty_coverage[item["case_id"]] = specialty_coverage.get(item["case_id"], 0) + 1

    ordered_recent = sorted(recent_scores, key=lambda item: item["saved_at"], reverse=True)[:8]
    averages = {
        key: round((domain_totals[key] / domain_counts[key]) * 100, 1)
        for key in domain_totals
        if domain_counts.get(key)
    }
    recent_trend = "not_enough_data"
    if len(ordered_recent) >= 3:
        recent_trend = "stable"
    return {
        "attempts_completed": len(completed),
        "recent_scores": ordered_recent,
        "domain_averages": averages,
        "recent_trend": recent_trend,
        "frequently_missed_history_domains": [
            {"criterion_id": key, "count": value}
            for key, value in sorted(missed_domains.items(), key=lambda item: (-item[1], item[0]))[:5]
        ],
        "safety_critical_omissions": safety_critical,
        "specialty_coverage": specialty_coverage,
        "cases_attempted": len({item["case_id"] for item in completed}),
    }
