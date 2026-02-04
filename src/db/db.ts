import Database from "better-sqlite3";

import { ensureParentDir } from "../util/fs.js";
import { migrations } from "./migrations.js";

export type Db = Database.Database;

export function openDb(dbPath: string): Db {
  ensureParentDir(dbPath);
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  applyMigrations(db);
  return db;
}

function applyMigrations(db: Db): void {
  const hasMigrationsTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations' LIMIT 1"
    )
    .get();

  if (!hasMigrationsTable) {
    db.exec(migrations[0]!.sql);
    db.prepare("INSERT INTO schema_migrations(version, name) VALUES(?, ?)").run(
      migrations[0]!.version,
      migrations[0]!.name
    );
  }

  const appliedRows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
    .all() as { version: number }[];
  const appliedVersions = new Set<number>(appliedRows.map((r) => r.version));

  const pending = migrations.filter((m) => !appliedVersions.has(m.version));
  if (pending.length === 0) return;

  const apply = db.transaction(() => {
    for (const m of pending) {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations(version, name) VALUES(?, ?)").run(m.version, m.name);
    }
  });
  apply();
}
