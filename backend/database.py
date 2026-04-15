import sqlite3
import os
from typing import List, Dict, Optional
import bcrypt

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DB_name = os.path.abspath(os.path.join(_THIS_DIR, "..", "auth.db"))

class DatabaseManager:
    def __init__(self, db_path: str = DB_name):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize the SQLite database with the users table."""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
                    nsu_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            conn.commit()

            cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
            if cursor.fetchone()[0] == 0:
                default_pw = os.getenv("ADMIN_DEFAULT_PASSWORD", "admin123")
                pw_hash = bcrypt.hashpw(default_pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                default_email = os.getenv("ADMIN_DEFAULT_EMAIL", "admin@nsu.edu")
                cursor.execute(
                    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                    ("System Admin", default_email, pw_hash, "admin")
                )
                conn.commit()
                print(f"Seeded default admin account: {default_email}")
        finally:
            conn.close()

    # ==================== USER METHODS ====================

    def add_user(self, name: str, email: str, password: str, role: str, nsu_id: str = None) -> Optional[Dict]:
        """Add a new user with hashed password. Returns user dict or None if email exists."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            cursor.execute(
                "INSERT INTO users (name, email, password_hash, role, nsu_id) VALUES (?, ?, ?, ?, ?)",
                (name, email.lower(), pw_hash, role, nsu_id)
            )
            conn.commit()
            user_id = cursor.lastrowid
            return {"id": user_id, "name": name, "email": email.lower(), "role": role, "nsu_id": nsu_id}
        except sqlite3.IntegrityError:
            return None  # Email already exists
        finally:
            conn.close()

    def authenticate_user(self, email: str, password: str, role: str) -> Optional[Dict]:
        """Verify credentials and return user dict (without password) or None."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, email, password_hash, role, nsu_id FROM users WHERE email = ? AND role = ?",
            (email.lower(), role)
        )
        row = cursor.fetchone()
        conn.close()
        
        if row and bcrypt.checkpw(password.encode('utf-8'), row[3].encode('utf-8')):
            return {"id": row[0], "name": row[1], "email": row[2], "role": row[4], "nsu_id": row[5]}
        return None

    def get_all_users(self, exclude_admins: bool = True) -> List[Dict]:
        """Get all users, optionally excluding admins."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        if exclude_admins:
            cursor.execute("SELECT id, name, email, role, nsu_id, created_at FROM users WHERE role != 'admin' ORDER BY created_at DESC")
        else:
            cursor.execute("SELECT id, name, email, role, nsu_id, created_at FROM users ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        return [{"id": r[0], "name": r[1], "email": r[2], "role": r[3], "nsu_id": r[4], "created_at": r[5]} for r in rows]

    def delete_user(self, user_id: int) -> bool:
        """Delete a user by ID."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Check if user exists and is not the last admin
        cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False
        
        if row[0] == 'admin':
            cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
            if cursor.fetchone()[0] <= 1:
                conn.close()
                return False  # Can't delete last admin
        
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        deleted = cursor.rowcount > 0
        conn.close()
        return deleted

    def email_exists(self, email: str) -> bool:
        """Check if an email is already registered."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users WHERE email = ?", (email.lower(),))
        exists = cursor.fetchone()[0] > 0
        conn.close()
        return exists

    # ==================== JOB RESULTS (persistent across logout) ====================

    def _ensure_job_results_table(self, cursor):
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS job_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                job_id TEXT NOT NULL UNIQUE,
                filename TEXT,
                result_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

    def save_job_result(self, user_id: int, job_id: str, filename: str, result_data: dict) -> bool:
        """Save a completed analysis result so it survives logout."""
        import json
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            self._ensure_job_results_table(cursor)
            conn.commit()
            cursor.execute(
                "INSERT OR REPLACE INTO job_results (user_id, job_id, filename, result_json) VALUES (?, ?, ?, ?)",
                (user_id, job_id, filename, json.dumps(result_data))
            )
            conn.commit()
            return True
        except Exception:
            return False
        finally:
            conn.close()

    def get_user_job_results(self, user_id: int, limit: int = 100) -> List[Dict]:
        """Fetch all saved results for a user (newest first)."""
        import json
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            self._ensure_job_results_table(cursor)
            conn.commit()
            cursor.execute(
                "SELECT job_id, filename, result_json, created_at FROM job_results WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            )
            rows = cursor.fetchall()
            results = []
            for row in rows:
                try:
                    results.append({
                        "job_id": row[0],
                        "filename": row[1],
                        "result": json.loads(row[2]),
                        "created_at": row[3],
                    })
                except Exception:
                    pass
            return results
        except Exception:
            return []
        finally:
            conn.close()

    def delete_job_result(self, user_id: int, job_id: str) -> bool:
        """Delete a saved result for a user."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            self._ensure_job_results_table(cursor)
            cursor.execute(
                "DELETE FROM job_results WHERE user_id = ? AND job_id = ?",
                (user_id, job_id)
            )
            conn.commit()
            return cursor.rowcount > 0
        except Exception:
            return False
        finally:
            conn.close()
