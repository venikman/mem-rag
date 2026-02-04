export type Migration = { version: number; name: string; sql: string };

export const migrations: Migration[] = [
  {
    version: 1,
    name: "init",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations(
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  },
  {
    version: 2,
    name: "core_tables",
    sql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS documents(
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        hash TEXT NOT NULL,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS document_texts(
        document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        text TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunk_sets(
        id INTEGER PRIMARY KEY,
        chunk_size INTEGER NOT NULL,
        overlap INTEGER NOT NULL,
        embed_model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(chunk_size, overlap, embed_model)
      );

      CREATE TABLE IF NOT EXISTS embeddings(
        id INTEGER PRIMARY KEY,
        dims INTEGER NOT NULL,
        vector_blob BLOB NOT NULL,
        model TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS chunks(
        id INTEGER PRIMARY KEY,
        chunk_set_id INTEGER NOT NULL REFERENCES chunk_sets(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        embedding_id INTEGER NOT NULL REFERENCES embeddings(id) ON DELETE RESTRICT,
        UNIQUE(chunk_set_id, document_id, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_chunk_set ON chunks(chunk_set_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks(embedding_id);

      CREATE TABLE IF NOT EXISTS sessions(
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS episodic_turns(
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
        text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_turns(session_id);

      CREATE TABLE IF NOT EXISTS semantic_memories(
        id INTEGER PRIMARY KEY,
        text TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('preference','decision','fact','insight','todo')),
        importance REAL NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        supersedes_id INTEGER REFERENCES semantic_memories(id),
        embedding_id INTEGER NOT NULL REFERENCES embeddings(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_semantic_embedding ON semantic_memories(embedding_id);
      CREATE INDEX IF NOT EXISTS idx_semantic_kind ON semantic_memories(kind);

      CREATE TABLE IF NOT EXISTS llm_cache(
        key TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        request_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  }
];

