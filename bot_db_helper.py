#!/usr/bin/env python3
"""Small SQLite helper for the Hermes Telegram bot.

This intentionally uses Python's stdlib sqlite3 so the Node bot does not need
native SQLite packages on Windows.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass


ROOT = Path("C:/Users/amd/hermes")
DB_PATH = ROOT / "bot_data.db"
EMBEDDING_MODEL = "local-hash-ngram-v1"
EMBEDDING_DIMS = 384


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def embedding_features(text: str) -> list[tuple[str, float]]:
    value = str(text or "").lower()
    features: list[tuple[str, float]] = []
    for token in re.findall(r"[a-z0-9_]+|[가-힣]+", value):
        if len(token) >= 2:
            features.append((f"tok:{token}", 1.0))
        if re.search(r"[가-힣]", token):
            for n in (2, 3):
                for index in range(max(0, len(token) - n + 1)):
                    features.append((f"ko{n}:{token[index:index+n]}", 0.65))
        elif len(token) >= 5:
            for index in range(len(token) - 2):
                features.append((f"en3:{token[index:index+3]}", 0.35))
    compact = re.sub(r"\s+", "", value)
    for n in (3, 4):
        for index in range(max(0, min(len(compact) - n + 1, 500))):
            gram = compact[index:index+n]
            if gram:
                features.append((f"char{n}:{gram}", 0.18))
    return features


def semantic_embedding_features(text: str) -> list[tuple[str, float]]:
    value = str(text or "").lower()
    features: list[tuple[str, float]] = []
    for token in re.findall(r"[a-z0-9_]+|[가-힣]+", value):
        if len(token) >= 2:
            features.append((f"tok:{token}", 1.0))
        if re.search(r"[가-힣]", token):
            for n in (2, 3):
                for index in range(max(0, len(token) - n + 1)):
                    features.append((f"ko{n}:{token[index:index+n]}", 0.8))
        elif len(token) >= 5:
            for index in range(len(token) - 2):
                features.append((f"en3:{token[index:index+3]}", 0.35))
    compact = re.sub(r"\s+", "", value)
    for n in (3, 4):
        for index in range(max(0, min(len(compact) - n + 1, 500))):
            gram = compact[index:index+n]
            if gram:
                features.append((f"char{n}:{gram}", 0.18))
    return features


def local_embedding(text: str) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMS
    for feature, weight in semantic_embedding_features(text):
        digest = hashlib.sha256(feature.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign * weight
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [round(value / norm, 6) for value in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    return float(sum(a * b for a, b in zip(left, right)))


def upsert_embedding(conn: sqlite3.Connection, target_type: str, target_id: int | str, text: str) -> None:
    embedding = local_embedding(text)
    conn.execute(
        """
        INSERT INTO embeddings(target_type, target_id, model, dims, embedding_json, updated_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(target_type, target_id, model) DO UPDATE SET
            dims = excluded.dims,
            embedding_json = excluded.embedding_json,
            updated_at = excluded.updated_at
        """,
        (target_type, str(target_id), EMBEDDING_MODEL, EMBEDDING_DIMS, json.dumps(embedding), now_iso()),
    )


def get_or_create_embedding(conn: sqlite3.Connection, target_type: str, target_id: int | str, text: str) -> list[float]:
    row = conn.execute(
        """
        SELECT embedding_json FROM embeddings
        WHERE target_type = ? AND target_id = ? AND model = ?
        """,
        (target_type, str(target_id), EMBEDDING_MODEL),
    ).fetchone()
    if row:
        try:
            return json.loads(row["embedding_json"])
        except json.JSONDecodeError:
            pass
    upsert_embedding(conn, target_type, target_id, text)
    return local_embedding(text)


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS session_memory (
                chat_id TEXT PRIMARY KEY,
                data_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS task_failures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_name TEXT NOT NULL,
                chat_id TEXT,
                message_id TEXT,
                error_msg TEXT NOT NULL,
                recovered INTEGER NOT NULL DEFAULT 0,
                recovery_note TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS task_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                task_name TEXT,
                chat_id TEXT,
                message_id TEXT,
                job_id TEXT,
                data_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs_queue (
                job_id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                message_id TEXT,
                status TEXT NOT NULL,
                task_name TEXT,
                pid INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                chat_id TEXT,
                message_id TEXT,
                request_text TEXT,
                task_name TEXT,
                status TEXT NOT NULL DEFAULT 'queued',
                priority INTEGER NOT NULL DEFAULT 0,
                phase TEXT,
                workflow_json TEXT NOT NULL DEFAULT '[]',
                cancel_requested INTEGER NOT NULL DEFAULT 0,
                started_at TEXT,
                updated_at TEXT NOT NULL,
                finished_at TEXT,
                error TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT,
                scope TEXT NOT NULL DEFAULT 'chat',
                kind TEXT NOT NULL DEFAULT 'fact',
                text TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '',
                importance INTEGER NOT NULL DEFAULT 1,
                source_message_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_memories_chat_updated
            ON agent_memories(chat_id, updated_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                message_id TEXT,
                role TEXT NOT NULL,
                text TEXT,
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created
            ON chat_messages(chat_id, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS artifacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT,
                message_id TEXT,
                kind TEXT NOT NULL,
                path TEXT,
                caption TEXT,
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_artifacts_chat_created
            ON artifacts(chat_id, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS embeddings (
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                model TEXT NOT NULL,
                dims INTEGER NOT NULL,
                embedding_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(target_type, target_id, model)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_embeddings_target
            ON embeddings(target_type, target_id)
            """
        )
    ensure_task_events_job_id_column()


def print_json(value) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False))


def ensure_task_events_job_id_column() -> None:
    with connect() as conn:
        cols = [row[1] for row in conn.execute("PRAGMA table_info(task_events)").fetchall()]
        if "job_id" not in cols:
            conn.execute("ALTER TABLE task_events ADD COLUMN job_id TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_task_events_job ON task_events(job_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_task_events_chat_message ON task_events(chat_id, message_id)")


def get_session(chat_id: str) -> None:
    init_db()
    with connect() as conn:
        row = conn.execute(
            "SELECT data_json FROM session_memory WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()
    print_json(json.loads(row["data_json"]) if row else {})


def set_session(chat_id: str, data_json: str) -> None:
    init_db()
    data = json.loads(data_json)
    encoded = json.dumps(data, ensure_ascii=False)
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO session_memory(chat_id, data_json, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET
                data_json = excluded.data_json,
                updated_at = excluded.updated_at
            """,
            (chat_id, encoded, now_iso()),
        )
    print_json({"ok": True})


def log_failure(task_name: str, chat_id: str, message_id: str, error_msg: str, recovered: int = 0) -> None:
    init_db()
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO task_failures(task_name, chat_id, message_id, error_msg, recovered, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (task_name, chat_id, message_id, error_msg, int(recovered), now_iso()),
        )
    print_json({"ok": True, "id": cur.lastrowid})


def get_recent_failures(limit: int) -> None:
    init_db()
    limit = max(1, min(50, int(limit)))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, task_name, chat_id, message_id, error_msg, recovered, recovery_note, created_at
            FROM task_failures
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    print_json([dict(row) for row in rows])


def get_recent_events(limit: int, chat_id: str | None = None, message_id: str | None = None, job_id: str | None = None) -> None:
    init_db()
    limit = max(1, min(100, int(limit)))
    query = """
        SELECT id, event_type, task_name, chat_id, message_id, job_id, data_json, created_at
        FROM task_events
        """
    conditions = []
    params = []
    if chat_id:
        conditions.append("chat_id = ?")
        params.append(chat_id)
    if message_id:
        conditions.append("message_id = ?")
        params.append(message_id)
    if job_id:
        conditions.append("job_id = ?")
        params.append(job_id)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with connect() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    decoded = []
    for row in rows:
        item = dict(row)
        try:
            item["data"] = json.loads(item.pop("data_json") or "{}")
        except json.JSONDecodeError:
            item["data"] = {"raw": item.pop("data_json", "")}
        decoded.append(item)
    print_json(decoded)


def mark_recovered(chat_id: str, message_id: str, note: str = "") -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            """
            UPDATE task_failures
            SET recovered = 1, recovery_note = ?
            WHERE chat_id = ? AND message_id = ?
            """,
            (note, chat_id, message_id),
        )
    print_json({"ok": True})


def log_event(event_type: str, task_name: str, chat_id: str, message_id: str, data_json: str = "{}", job_id: str | None = None) -> None:
    init_db()
    data = json.loads(data_json)
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO task_events(event_type, task_name, chat_id, message_id, job_id, data_json, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (event_type, task_name, chat_id, message_id, str(job_id or ""), json.dumps(data, ensure_ascii=False), now_iso()),
        )
    print_json({"ok": True, "id": cur.lastrowid})


def upsert_job(job_json: str) -> None:
    init_db()
    job = json.loads(job_json)
    now = now_iso()
    workflow = job.get("workflow", job.get("workflow_json", []))
    if isinstance(workflow, str):
        workflow_json = workflow
    else:
        workflow_json = json.dumps(workflow, ensure_ascii=False)
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO jobs(
                job_id, chat_id, message_id, request_text, task_name, status,
                priority, phase, workflow_json, cancel_requested,
                started_at, updated_at, finished_at, error
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                chat_id = excluded.chat_id,
                message_id = excluded.message_id,
                request_text = excluded.request_text,
                task_name = excluded.task_name,
                status = excluded.status,
                priority = excluded.priority,
                phase = excluded.phase,
                workflow_json = excluded.workflow_json,
                cancel_requested = excluded.cancel_requested,
                started_at = COALESCE(excluded.started_at, jobs.started_at),
                updated_at = excluded.updated_at,
                finished_at = excluded.finished_at,
                error = excluded.error
            """
            ,
            (
                str(job.get("job_id", "")),
                str(job.get("chat_id", "")),
                str(job.get("message_id", "")),
                job.get("request_text", ""),
                job.get("task_name", ""),
                job.get("status", "queued"),
                int(job.get("priority", 0)),
                job.get("phase", ""),
                workflow_json,
                int(bool(job.get("cancel_requested", False))),
                job.get("started_at") or now,
                now,
                job.get("finished_at"),
                job.get("error"),
            ),
        )
    print_json({"ok": True, "job_id": str(job.get("job_id", ""))})


def update_job(job_id: str, patch_json: str) -> None:
    init_db()
    patch = json.loads(patch_json)
    allowed = {
        "task_name",
        "status",
        "priority",
        "phase",
        "workflow_json",
        "cancel_requested",
        "started_at",
        "finished_at",
        "error",
    }
    values = {}
    for key, value in patch.items():
        if key == "workflow":
            values["workflow_json"] = json.dumps(value, ensure_ascii=False)
        elif key in allowed:
            values[key] = int(bool(value)) if key == "cancel_requested" else value
    values["updated_at"] = now_iso()
    if not values:
        print_json({"ok": True, "job_id": job_id, "updated": 0})
        return
    assignments = ", ".join(f"{key} = ?" for key in values)
    params = list(values.values()) + [job_id]
    with connect() as conn:
        cur = conn.execute(f"UPDATE jobs SET {assignments} WHERE job_id = ?", params)
    print_json({"ok": True, "job_id": job_id, "updated": cur.rowcount})


def request_cancel(chat_id: str) -> None:
    init_db()
    now = now_iso()
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE jobs
            SET cancel_requested = 1,
                status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
                finished_at = CASE WHEN status = 'queued' THEN ? ELSE finished_at END,
                updated_at = ?
            WHERE chat_id = ?
              AND status IN ('queued', 'running')
            """,
            (now, now, chat_id),
        )
    print_json({"ok": True, "updated": cur.rowcount})


def decode_job_row(row: sqlite3.Row) -> dict:
    item = dict(row)
    try:
        item["workflow"] = json.loads(item.pop("workflow_json") or "[]")
    except json.JSONDecodeError:
        item["workflow"] = []
    item["cancel_requested"] = bool(item.get("cancel_requested"))
    return item


def get_active_job(chat_id: str | None = None) -> None:
    init_db()
    if chat_id:
        query = """
            SELECT * FROM jobs
            WHERE chat_id = ? AND status IN ('queued', 'running')
            ORDER BY updated_at DESC
            LIMIT 1
            """
        params = (chat_id,)
    else:
        query = """
            SELECT * FROM jobs
            WHERE status IN ('queued', 'running')
            ORDER BY updated_at DESC
            LIMIT 1
            """
        params = ()
    with connect() as conn:
        row = conn.execute(query, params).fetchone()
    print_json(decode_job_row(row) if row else None)


def get_recent_jobs(limit: int, chat_id: str | None = None) -> None:
    init_db()
    limit = max(1, min(50, int(limit)))
    if chat_id:
        query = """
            SELECT * FROM jobs
            WHERE chat_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
            """
        params = (chat_id, limit)
    else:
        query = """
            SELECT * FROM jobs
            ORDER BY updated_at DESC
            LIMIT ?
            """
        params = (limit,)
    with connect() as conn:
        rows = conn.execute(query, params).fetchall()
    print_json([decode_job_row(row) for row in rows])


def get_queued_jobs(limit: int = 20) -> None:
    init_db()
    limit = max(1, min(100, int(limit)))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM jobs
            WHERE status = 'queued' AND cancel_requested = 0
            ORDER BY updated_at ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    print_json([decode_job_row(row) for row in rows])


def add_memory(memory_json: str) -> None:
    init_db()
    memory = json.loads(memory_json)
    text = str(memory.get("text", "")).strip()
    if not text:
        print_json({"ok": False, "error": "empty memory"})
        return
    now = now_iso()
    with connect() as conn:
        existing = conn.execute(
            """
            SELECT id FROM agent_memories
            WHERE COALESCE(chat_id, '') = COALESCE(?, '')
              AND text = ?
            LIMIT 1
            """,
            (str(memory.get("chat_id", "")), text),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE agent_memories
                SET importance = MAX(importance, ?),
                    tags = CASE WHEN ? != '' THEN ? ELSE tags END,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    int(memory.get("importance", 1)),
                    str(memory.get("tags", "")),
                    str(memory.get("tags", "")),
                    now,
                    existing["id"],
                ),
            )
            upsert_embedding(
                conn,
                "memory",
                existing["id"],
                f"{text} {memory.get('tags', '')} {memory.get('kind', 'fact')}",
            )
            print_json({"ok": True, "id": existing["id"], "deduped": True})
            return
        cur = conn.execute(
            """
            INSERT INTO agent_memories(chat_id, scope, kind, text, tags, importance, source_message_id, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(memory.get("chat_id", "")),
                str(memory.get("scope", "chat")),
                str(memory.get("kind", "fact")),
                text,
                str(memory.get("tags", "")),
                int(memory.get("importance", 1)),
                str(memory.get("source_message_id", "")),
                now,
                now,
            ),
        )
        upsert_embedding(
            conn,
            "memory",
            cur.lastrowid,
            f"{text} {memory.get('tags', '')} {memory.get('kind', 'fact')}",
        )
    print_json({"ok": True, "id": cur.lastrowid, "deduped": False})


def search_memories(chat_id: str, query: str, limit: int = 8) -> None:
    init_db()
    limit = max(1, min(30, int(limit)))
    query = str(query or "").strip()
    raw_terms = [part.strip().lower() for part in query.replace("/", " ").replace(",", " ").split()]
    terms = [term for term in raw_terms if len(term) >= 2][:8]
    query_embedding = local_embedding(query)
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM agent_memories
            WHERE chat_id IN (?, '')
            ORDER BY importance DESC, updated_at DESC
            LIMIT 100
            """,
            (str(chat_id),),
        ).fetchall()
        scored = []
        for row in rows:
            item = dict(row)
            haystack = f"{item.get('text', '')} {item.get('tags', '')} {item.get('kind', '')}".lower()
            lexical_hits = sum(1 for term in terms if term in haystack) if terms else 0
            embedding = get_or_create_embedding(conn, "memory", item["id"], haystack)
            semantic = cosine_similarity(query_embedding, embedding)
            if terms and lexical_hits == 0 and semantic < 0.08:
                continue
            score = int(item.get("importance") or 1) + lexical_hits * 10 + int(max(0.0, semantic) * 100)
            item["semantic_score"] = round(semantic, 4)
            item["lexical_hits"] = lexical_hits
            scored.append((score, item))
    scored.sort(key=lambda pair: (pair[0], pair[1].get("updated_at", "")), reverse=True)
    print_json([item | {"score": score} for score, item in scored[:limit]])


def search_messages(chat_id: str, query: str, limit: int = 8) -> None:
    init_db()
    limit = max(1, min(30, int(limit)))
    query = str(query or "").strip()
    raw_terms = [part.strip().lower() for part in query.replace("/", " ").replace(",", " ").split()]
    terms = [term for term in raw_terms if len(term) >= 2][:8]
    query_embedding = local_embedding(query)
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM chat_messages
            WHERE chat_id = ?
            ORDER BY id DESC
            LIMIT 300
            """,
            (str(chat_id),),
        ).fetchall()
        scored = []
        for row in rows:
            item = dict(row)
            text = str(item.get("text", ""))
            haystack = text.lower()
            lexical_hits = sum(1 for term in terms if term in haystack) if terms else 0
            embedding = get_or_create_embedding(conn, "message", item["id"], text)
            semantic = cosine_similarity(query_embedding, embedding)
            if terms and lexical_hits == 0 and semantic < 0.08:
                continue
            score = lexical_hits * 10 + int(max(0.0, semantic) * 100)
            item["semantic_score"] = round(semantic, 4)
            item["lexical_hits"] = lexical_hits
            try:
                item["meta"] = json.loads(item.pop("meta_json") or "{}")
            except json.JSONDecodeError:
                item["meta"] = {}
            scored.append((score, item))
    scored.sort(key=lambda pair: (pair[0], pair[1].get("id", 0)), reverse=True)
    print_json([item | {"score": score} for score, item in scored[:limit]])


def get_recent_memories(chat_id: str, limit: int = 10) -> None:
    init_db()
    limit = max(1, min(50, int(limit)))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM agent_memories
            WHERE chat_id IN (?, '')
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (str(chat_id), limit),
        ).fetchall()
    print_json([dict(row) for row in rows])


def log_message(message_json: str) -> None:
    init_db()
    message = json.loads(message_json)
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO chat_messages(chat_id, message_id, role, text, meta_json, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (
                str(message.get("chat_id", "")),
                str(message.get("message_id", "")),
                str(message.get("role", "user")),
                str(message.get("text", "")),
                json.dumps(message.get("meta", {}), ensure_ascii=False),
                message.get("created_at") or now_iso(),
            ),
        )
        upsert_embedding(conn, "message", cur.lastrowid, str(message.get("text", "")))
    print_json({"ok": True, "id": cur.lastrowid})


def get_recent_messages(chat_id: str, limit: int = 20) -> None:
    init_db()
    limit = max(1, min(80, int(limit)))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM chat_messages
            WHERE chat_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (str(chat_id), limit),
        ).fetchall()
    decoded = []
    for row in reversed(rows):
        item = dict(row)
        try:
            item["meta"] = json.loads(item.pop("meta_json") or "{}")
        except json.JSONDecodeError:
            item["meta"] = {}
        decoded.append(item)
    print_json(decoded)


def log_artifact(artifact_json: str) -> None:
    init_db()
    artifact = json.loads(artifact_json)
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO artifacts(chat_id, message_id, kind, path, caption, meta_json, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(artifact.get("chat_id", "")),
                str(artifact.get("message_id", "")),
                str(artifact.get("kind", "")),
                str(artifact.get("path", "")),
                str(artifact.get("caption", "")),
                json.dumps(artifact.get("meta", {}), ensure_ascii=False),
                artifact.get("created_at") or now_iso(),
            ),
        )
        upsert_embedding(
            conn,
            "artifact",
            cur.lastrowid,
            f"{artifact.get('kind', '')} {artifact.get('caption', '')} {artifact.get('path', '')}",
        )
    print_json({"ok": True, "id": cur.lastrowid})


def reindex_embeddings() -> None:
    init_db()
    counts = {"memory": 0, "message": 0, "artifact": 0}
    with connect() as conn:
        for row in conn.execute("SELECT * FROM agent_memories").fetchall():
            upsert_embedding(conn, "memory", row["id"], f"{row['text']} {row['tags']} {row['kind']}")
            counts["memory"] += 1
        for row in conn.execute("SELECT * FROM chat_messages").fetchall():
            upsert_embedding(conn, "message", row["id"], row["text"] or "")
            counts["message"] += 1
        for row in conn.execute("SELECT * FROM artifacts").fetchall():
            upsert_embedding(conn, "artifact", row["id"], f"{row['kind']} {row['caption']} {row['path']}")
            counts["artifact"] += 1
    print_json({"ok": True, "model": EMBEDDING_MODEL, "dims": EMBEDDING_DIMS, "counts": counts})


def get_recent_artifacts(chat_id: str, limit: int = 10) -> None:
    init_db()
    limit = max(1, min(50, int(limit)))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM artifacts
            WHERE chat_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (str(chat_id), limit),
        ).fetchall()
    decoded = []
    for row in rows:
        item = dict(row)
        try:
            item["meta"] = json.loads(item.pop("meta_json") or "{}")
        except json.JSONDecodeError:
            item["meta"] = {}
        decoded.append(item)
    print_json(decoded)


def get_agent_reflection_context(chat_id: str) -> None:
    init_db()
    with connect() as conn:
        failures = conn.execute(
            """
            SELECT task_name, error_msg, recovered, recovery_note, created_at
            FROM task_failures
            WHERE chat_id = ? OR chat_id = ''
            ORDER BY id DESC
            LIMIT 5
            """,
            (chat_id,),
        ).fetchall()
        
        stats = conn.execute(
            """
            SELECT 
                COUNT(*) as total_failures,
                SUM(CASE WHEN recovered = 1 THEN 1 ELSE 0 END) as total_recovered
            FROM task_failures
            WHERE chat_id = ? OR chat_id = ''
            """,
            (chat_id,),
        ).fetchone()
        
        events = conn.execute(
            """
            SELECT event_type, task_name, created_at
            FROM task_events
            WHERE chat_id = ? OR chat_id = ''
            ORDER BY id DESC
            LIMIT 10
            """,
            (chat_id,),
        ).fetchall()
        
    context = {
        "recent_failures": [dict(f) for f in failures],
        "stats": {
            "total_failures": stats["total_failures"] if stats else 0,
            "total_recovered": stats["total_recovered"] if stats else 0,
        },
        "recent_events": [dict(e) for e in events]
    }
    print_json(context)


def add_queue_job(job_id: str, chat_id: str, message_id: str, status: str, task_name: str, pid: int | None = None) -> None:
    init_db()
    now = now_iso()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO jobs_queue(job_id, chat_id, message_id, status, task_name, pid, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                status = excluded.status,
                pid = COALESCE(excluded.pid, jobs_queue.pid),
                updated_at = excluded.updated_at
            """,
            (job_id, chat_id, message_id, status, task_name, pid, now, now),
        )
    print_json({"ok": True, "job_id": job_id})


def update_queue_job(job_id: str, status: str, pid: int | None = None) -> None:
    init_db()
    now = now_iso()
    with connect() as conn:
        if pid is not None:
            conn.execute(
                "UPDATE jobs_queue SET status = ?, pid = ?, updated_at = ? WHERE job_id = ?",
                (status, pid, now, job_id),
            )
        else:
            conn.execute(
                "UPDATE jobs_queue SET status = ?, updated_at = ? WHERE job_id = ?",
                (status, now, job_id),
            )
    print_json({"ok": True, "job_id": job_id})


def get_active_queue_job(chat_id: str) -> None:
    init_db()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM jobs_queue
            WHERE chat_id = ? AND status IN ('queued', 'running')
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (chat_id,),
        ).fetchone()
    print_json(dict(row) if row else None)


def delete_queue_job(job_id: str) -> None:
    init_db()
    with connect() as conn:
        conn.execute("DELETE FROM jobs_queue WHERE job_id = ?", (job_id,))
    print_json({"ok": True, "job_id": job_id})


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init")

    get_session_parser = sub.add_parser("get-session")
    get_session_parser.add_argument("chat_id")

    set_session_parser = sub.add_parser("set-session")
    set_session_parser.add_argument("chat_id")
    set_session_parser.add_argument("data_json")

    log_failure_parser = sub.add_parser("log-failure")
    log_failure_parser.add_argument("task_name")
    log_failure_parser.add_argument("chat_id")
    log_failure_parser.add_argument("message_id")
    log_failure_parser.add_argument("error_msg")
    log_failure_parser.add_argument("recovered", nargs="?", default="0")

    recent_parser = sub.add_parser("get-recent-failures")
    recent_parser.add_argument("limit", nargs="?", default="5")

    events_parser = sub.add_parser("get-recent-events")
    events_parser.add_argument("limit", nargs="?", default="10")
    events_parser.add_argument("chat_id", nargs="?")
    events_parser.add_argument("message_id", nargs="?")
    events_parser.add_argument("--job-id", default="")

    recovered_parser = sub.add_parser("mark-recovered")
    recovered_parser.add_argument("chat_id")
    recovered_parser.add_argument("message_id")
    recovered_parser.add_argument("note", nargs="?", default="")

    event_parser = sub.add_parser("log-event")
    event_parser.add_argument("event_type")
    event_parser.add_argument("task_name")
    event_parser.add_argument("chat_id")
    event_parser.add_argument("message_id")
    event_parser.add_argument("data_json", nargs="?", default="{}")
    event_parser.add_argument("--job-id", default="")

    upsert_job_parser = sub.add_parser("upsert-job")
    upsert_job_parser.add_argument("job_json")

    update_job_parser = sub.add_parser("update-job")
    update_job_parser.add_argument("job_id")
    update_job_parser.add_argument("patch_json")

    cancel_parser = sub.add_parser("request-cancel")
    cancel_parser.add_argument("chat_id")

    active_job_parser = sub.add_parser("get-active-job")
    active_job_parser.add_argument("chat_id", nargs="?")

    recent_jobs_parser = sub.add_parser("get-recent-jobs")
    recent_jobs_parser.add_argument("limit", nargs="?", default="5")
    recent_jobs_parser.add_argument("chat_id", nargs="?")

    queued_jobs_parser = sub.add_parser("get-queued-jobs")
    queued_jobs_parser.add_argument("limit", nargs="?", default="20")

    add_memory_parser = sub.add_parser("add-memory")
    add_memory_parser.add_argument("memory_json")

    search_memory_parser = sub.add_parser("search-memories")
    search_memory_parser.add_argument("chat_id")
    search_memory_parser.add_argument("query")
    search_memory_parser.add_argument("limit", nargs="?", default="8")

    search_messages_parser = sub.add_parser("search-messages")
    search_messages_parser.add_argument("chat_id")
    search_messages_parser.add_argument("query")
    search_messages_parser.add_argument("limit", nargs="?", default="8")

    recent_memory_parser = sub.add_parser("get-recent-memories")
    recent_memory_parser.add_argument("chat_id")
    recent_memory_parser.add_argument("limit", nargs="?", default="10")

    log_message_parser = sub.add_parser("log-message")
    log_message_parser.add_argument("message_json")

    recent_messages_parser = sub.add_parser("get-recent-messages")
    recent_messages_parser.add_argument("chat_id")
    recent_messages_parser.add_argument("limit", nargs="?", default="20")

    log_artifact_parser = sub.add_parser("log-artifact")
    log_artifact_parser.add_argument("artifact_json")

    recent_artifacts_parser = sub.add_parser("get-recent-artifacts")
    recent_artifacts_parser.add_argument("chat_id")
    recent_artifacts_parser.add_argument("limit", nargs="?", default="10")

    sub.add_parser("reindex-embeddings")

    # New reflection & jobs_queue commands
    get_reflection_parser = sub.add_parser("get-agent-reflection-context")
    get_reflection_parser.add_argument("chat_id")

    add_queue_job_parser = sub.add_parser("add-queue-job")
    add_queue_job_parser.add_argument("job_id")
    add_queue_job_parser.add_argument("chat_id")
    add_queue_job_parser.add_argument("message_id")
    add_queue_job_parser.add_argument("status")
    add_queue_job_parser.add_argument("task_name")
    add_queue_job_parser.add_argument("--pid", type=int, default=None)

    update_queue_job_parser = sub.add_parser("update-queue-job")
    update_queue_job_parser.add_argument("job_id")
    update_queue_job_parser.add_argument("status")
    update_queue_job_parser.add_argument("--pid", type=int, default=None)

    active_queue_job_parser = sub.add_parser("get-active-queue-job")
    active_queue_job_parser.add_argument("chat_id")

    delete_queue_job_parser = sub.add_parser("delete-queue-job")
    delete_queue_job_parser.add_argument("job_id")

    args = parser.parse_args()
    if args.cmd == "init":
        init_db()
        print_json({"ok": True, "db": str(DB_PATH)})
    elif args.cmd == "get-session":
        get_session(args.chat_id)
    elif args.cmd == "set-session":
        set_session(args.chat_id, args.data_json)
    elif args.cmd == "log-failure":
        log_failure(args.task_name, args.chat_id, args.message_id, args.error_msg, int(args.recovered))
    elif args.cmd == "get-recent-failures":
        get_recent_failures(int(args.limit))
    elif args.cmd == "get-recent-events":
        get_recent_events(int(args.limit), args.chat_id, args.message_id, args.job_id)
    elif args.cmd == "mark-recovered":
        mark_recovered(args.chat_id, args.message_id, args.note)
    elif args.cmd == "log-event":
        log_event(args.event_type, args.task_name, args.chat_id, args.message_id, args.data_json, args.job_id)
    elif args.cmd == "upsert-job":
        upsert_job(args.job_json)
    elif args.cmd == "update-job":
        update_job(args.job_id, args.patch_json)
    elif args.cmd == "request-cancel":
        request_cancel(args.chat_id)
    elif args.cmd == "get-active-job":
        get_active_job(args.chat_id)
    elif args.cmd == "get-recent-jobs":
        get_recent_jobs(int(args.limit), args.chat_id)
    elif args.cmd == "get-queued-jobs":
        get_queued_jobs(int(args.limit))
    elif args.cmd == "add-memory":
        add_memory(args.memory_json)
    elif args.cmd == "search-memories":
        search_memories(args.chat_id, args.query, int(args.limit))
    elif args.cmd == "search-messages":
        search_messages(args.chat_id, args.query, int(args.limit))
    elif args.cmd == "get-recent-memories":
        get_recent_memories(args.chat_id, int(args.limit))
    elif args.cmd == "log-message":
        log_message(args.message_json)
    elif args.cmd == "get-recent-messages":
        get_recent_messages(args.chat_id, int(args.limit))
    elif args.cmd == "log-artifact":
        log_artifact(args.artifact_json)
    elif args.cmd == "get-recent-artifacts":
        get_recent_artifacts(args.chat_id, int(args.limit))
    elif args.cmd == "reindex-embeddings":
        reindex_embeddings()
    elif args.cmd == "get-agent-reflection-context":
        get_agent_reflection_context(args.chat_id)
    elif args.cmd == "add-queue-job":
        add_queue_job(args.job_id, args.chat_id, args.message_id, args.status, args.task_name, args.pid)
    elif args.cmd == "update-queue-job":
        update_queue_job(args.job_id, args.status, args.pid)
    elif args.cmd == "get-active-queue-job":
        get_active_queue_job(args.chat_id)
    elif args.cmd == "delete-queue-job":
        delete_queue_job(args.job_id)


if __name__ == "__main__":
    main()
