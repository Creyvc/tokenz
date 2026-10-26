import json
import sqlite3
from pathlib import Path


class Repository:
    """A complete JSON snapshot per run preserves partial failures and version metadata."""
    def __init__(self, path, enabled=True):
        self.path, self.enabled = Path(path), enabled
        if enabled:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.connect() as db:
                db.execute("CREATE TABLE IF NOT EXISTS experiments (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
                db.execute("CREATE TABLE IF NOT EXISTS studies (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=30)

    def save(self, row):
        if self.enabled:
            with self.connect() as db:
                db.execute("INSERT INTO experiments VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
                           (row["id"], json.dumps(row, ensure_ascii=False, allow_nan=False)))

    def all(self):
        if not self.enabled:
            return []
        with self.connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT payload FROM experiments ORDER BY rowid DESC")]

    def get(self, experiment_id):
        if not self.enabled:
            return None
        with self.connect() as db:
            row = db.execute("SELECT payload FROM experiments WHERE id=?", (experiment_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def save_study(self, study):
        if self.enabled:
            with self.connect() as db:
                db.execute("INSERT INTO studies VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
                           (study["id"], json.dumps(study, ensure_ascii=False, allow_nan=False)))

    def save_review(self, study, row):
        """Commit a human review and its study snapshot in one transaction."""
        if self.enabled:
            row_payload = json.dumps(row, ensure_ascii=False, allow_nan=False)
            study_payload = json.dumps(study, ensure_ascii=False, allow_nan=False)
            with self.connect() as db:
                db.execute('INSERT INTO experiments VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                           (row['id'], row_payload))
                db.execute('INSERT INTO studies VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                           (study['id'], study_payload))

    def studies(self):
        if not self.enabled:
            return []
        with self.connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT payload FROM studies ORDER BY rowid DESC")]
