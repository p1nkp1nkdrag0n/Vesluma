import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  emptySyncSnapshot, mergeSyncSnapshots, snapshotFingerprint, validateSyncSnapshot,
  type SyncSnapshot,
} from '../src/lib/syncProtocol'
import { LocalApiError } from './errors'

export type LocalSpace = 'local-a' | 'local-b'
export interface SyncRequest {
  requestId: string
  clientId: string
  sequence: number
  snapshot: SyncSnapshot
}
export interface SyncResult { revision: number; snapshot: SyncSnapshot }
export const SCHEMA_VERSION = 1

interface StoredSnapshot { revision: number; snapshot: string }
interface StoredPhoto { mime: string; bytes: Uint8Array; digest: string }
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

/** Each instance owns its connection. Tests must use an isolated temporary path. */
export class LocalDatabase {
  private readonly connection: DatabaseSync

  constructor(path: string) {
    if (!path) throw new Error('A database path is required.')
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true })
    this.connection = new DatabaseSync(path)
    try {
      this.connection.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
      const version = Number((this.connection.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
      if (version > SCHEMA_VERSION) throw new Error('Database schema is newer than this application. Use the newer application.')
      if (version === 0) this.migrateInitialSchema()
      this.connection.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    } catch (error) {
      this.connection.close()
      throw error
    }
  }

  private migrateInitialSchema(): void {
    this.transaction(() => {
      this.connection.exec(`
        CREATE TABLE spaces (
          id TEXT PRIMARY KEY CHECK (id IN ('local-a', 'local-b')),
          revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
          snapshot TEXT NOT NULL CHECK (json_valid(snapshot))
        ) STRICT;
        CREATE TABLE photos (
          space_id TEXT NOT NULL REFERENCES spaces(id),
          id TEXT NOT NULL,
          mime TEXT NOT NULL,
          bytes BLOB NOT NULL,
          digest TEXT NOT NULL,
          PRIMARY KEY (space_id, id)
        ) STRICT;
        CREATE TABLE receipts (
          space_id TEXT NOT NULL REFERENCES spaces(id),
          request_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          sequence INTEGER NOT NULL CHECK (sequence >= 0),
          payload_hash TEXT NOT NULL,
          PRIMARY KEY (space_id, request_id)
        ) STRICT;
      `)
      const insert = this.connection.prepare('INSERT INTO spaces (id, snapshot) VALUES (?, ?)')
      const initial = snapshotFingerprint(emptySyncSnapshot())
      insert.run('local-a', initial)
      insert.run('local-b', initial)
      this.connection.exec('PRAGMA user_version = 1')
    })
  }

  private transaction<T>(operation: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.connection.exec('COMMIT')
      return result
    } catch (error) {
      this.connection.exec('ROLLBACK')
      throw error
    }
  }

  getSnapshot(space: LocalSpace): SyncResult {
    const row = this.connection.prepare('SELECT revision, snapshot FROM spaces WHERE id = ?').get(space) as unknown as StoredSnapshot | undefined
    if (!row) throw new LocalApiError(400, 'INVALID_SPACE', 'Select a local validation space.')
    return { revision: row.revision, snapshot: JSON.parse(row.snapshot) as SyncSnapshot }
  }

  putPhoto(space: LocalSpace, id: string, mime: string, bytes: Uint8Array): void {
    this.transaction(() => {
      const existing = this.getPhoto(space, id)
      const hash = digest(bytes)
      if (existing) {
        if (existing.digest !== hash || existing.mime !== mime) {
          throw new LocalApiError(409, 'PHOTO_CONFLICT', 'This photo identifier already has different content.')
        }
        return
      }
      this.connection.prepare('INSERT INTO photos (space_id, id, mime, bytes, digest) VALUES (?, ?, ?, ?, ?)')
        .run(space, id, mime, bytes, hash)
    })
  }

  getPhoto(space: LocalSpace, id: string): StoredPhoto | undefined {
    return this.connection.prepare('SELECT mime, bytes, digest FROM photos WHERE space_id = ? AND id = ?')
      .get(space, id) as unknown as StoredPhoto | undefined
  }

  merge(space: LocalSpace, request: SyncRequest): SyncResult & { replayed: boolean } {
    // Validate before opening a transaction; only the canonical bounded snapshot is hashed/stored.
    const snapshot = validateSyncSnapshot(request.snapshot)
    const payloadHash = digest(JSON.stringify([request.clientId, request.sequence, snapshotFingerprint(snapshot)]))
    return this.transaction(() => {
      const receipt = this.connection.prepare('SELECT payload_hash FROM receipts WHERE space_id = ? AND request_id = ?')
        .get(space, request.requestId) as { payload_hash: string } | undefined
      if (receipt) {
        if (receipt.payload_hash !== payloadHash) {
          throw new LocalApiError(409, 'REQUEST_CONFLICT', 'This request identifier was already used for a different payload.')
        }
        return { ...this.getSnapshot(space), replayed: true }
      }
      // A metadata record is never committed before its private photo bytes exist in this space.
      const hasPhoto = this.connection.prepare('SELECT 1 FROM photos WHERE space_id = ? AND id = ?')
      for (const visit of snapshot.visits) {
        if (!visit.photoUrl && !hasPhoto.get(space, visit.photoId)) {
          throw new LocalApiError(422, 'PHOTO_MISSING', 'Upload every referenced photo before syncing progress.')
        }
      }
      const current = this.getSnapshot(space)
      const merged = mergeSyncSnapshots(current.snapshot, snapshot)
      const serialized = snapshotFingerprint(merged)
      const changed = serialized !== snapshotFingerprint(current.snapshot)
      const revision = current.revision + (changed ? 1 : 0)
      if (changed) {
        this.connection.prepare('UPDATE spaces SET revision = ?, snapshot = ? WHERE id = ?').run(revision, serialized, space)
      }
      // Lower or repeated sequences from distinct requests can contain valid offline additions.
      // Request IDs deduplicate transport retries; record IDs deduplicate domain facts.
      this.connection.prepare('INSERT INTO receipts (space_id, request_id, client_id, sequence, payload_hash) VALUES (?, ?, ?, ?, ?)')
        .run(space, request.requestId, request.clientId, request.sequence, payloadHash)
      return { revision, snapshot: merged, replayed: false }
    })
  }

  close(): void { this.connection.close() }
}
