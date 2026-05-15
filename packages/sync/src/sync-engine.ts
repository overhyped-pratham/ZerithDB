import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { ZerithDBConfig, SyncState } from "zerithdb-core";
import { EventEmitter } from "zerithdb-core";
import type { DbClient } from "zerithdb-db";
import type { NetworkManager } from "zerithdb-network";

type SyncEvents = {
  "state:change": SyncState;
  "update:local": { collectionName: string; update: Uint8Array };
  "update:remote": { collectionName: string; update: Uint8Array; fromPeer: string };
};

/**
 * CRDT sync engine — manages one Yjs Y.Doc per collection.
 * Local writes update the Y.Doc, which generates binary deltas sent to peers.
 * Incoming peer deltas are applied to the Y.Doc, which reactively updates the DB.
 */
export class SyncEngine extends EventEmitter<SyncEvents> {
  private readonly docs = new Map<string, Y.Doc>();
  private readonly persistences = new Map<string, IndexeddbPersistence>();
  private _enabled = false;
  private _state: SyncState = { synced: false, pendingUpdates: 0, connectedPeers: 0 };

  constructor(
    private readonly config: ZerithDBConfig,
    private readonly db: DbClient,
    private readonly network: NetworkManager
  ) {
    super();
    this.onPeerUpdate = this.onPeerUpdate.bind(this);
  }

  /**
   * Enable P2P sync. After calling this, local changes are broadcast
   * to connected peers and remote updates are applied locally.
   */
  enable(): void {
    if (this._enabled) return;
    this._enabled = true;
    this.network.on("message", this.onPeerUpdate);
    this.updateState({ synced: true });
  }

  /** Disable sync without disconnecting from peers */
  disable(): void {
    this._enabled = false;
    this.network.off("message", this.onPeerUpdate);
    this.updateState({ synced: false });
  }

  /** Current sync state snapshot */
  get state(): Readonly<SyncState> {
    return this._state;
  }

  /**
   * Get or create the Yjs document for a collection.
   * Documents are persisted to IndexedDB via y-indexeddb.
   */
  getDoc(collectionName: string): Y.Doc {
    if (this.docs.has(collectionName)) {
      // biome-ignore lint: map guarantees defined
      return this.docs.get(collectionName)!;
    }

    const doc = new Y.Doc({ guid: `${this.config.appId}:${collectionName}` });

    // Persist to IndexedDB
    const persistence = new IndexeddbPersistence(
      `zerithdb_sync_${this.config.appId}_${collectionName}`,
      doc
    );
    this.persistences.set(collectionName, persistence);

    // Broadcast local updates to peers
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return; // Don't echo back remote updates
      if (!this._enabled) return;

      this.emit("update:local", { collectionName, update });
      this.network.broadcast({
        type: "sync-update",
        payload: this.encodeMessage(collectionName, update),
      });
    });

    this.docs.set(collectionName, doc);
    return doc;
  }

  /**
   * Apply a remote CRDT update to the local document.
   * Called by the network layer when a peer sends an update.
   */
  applyRemoteUpdate(collectionName: string, update: Uint8Array, fromPeer: string): void {
    const doc = this.getDoc(collectionName);
    Y.applyUpdate(doc, update, "remote");
    this.emit("update:remote", { collectionName, update, fromPeer });
  }

  async dispose(): Promise<void> {
    this.disable();
    for (const [, persistence] of this.persistences) {
      await persistence.destroy();
    }
    for (const [, doc] of this.docs) {
      doc.destroy();
    }
    this.docs.clear();
    this.persistences.clear();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private onPeerUpdate(msg: { type: string; payload: Uint8Array | string; from: string }): void {
    if (msg.type !== "sync-update") return;

    const payload = typeof msg.payload === "string" ? base64ToBytes(msg.payload) : msg.payload;

    const decoded = this.decodeMessage(payload);
    if (decoded === null) return;

    this.applyRemoteUpdate(decoded.collectionName, decoded.update, msg.from);
  }

  private encodeMessage(collectionName: string, update: Uint8Array): string {
    const nameBytes = new TextEncoder().encode(collectionName);
    // Use 2-byte big-endian header to support collection names up to 65535 bytes
    const header = new Uint8Array(2);
    header[0] = (nameBytes.length >> 8) & 0xff;
    header[1] = nameBytes.length & 0xff;
    const combined = new Uint8Array(2 + nameBytes.length + update.length);
    combined.set(header, 0);
    combined.set(nameBytes, 2);
    combined.set(update, 2 + nameBytes.length);
    return bytesToBase64(combined);
  }

  private decodeMessage(bytes: Uint8Array): {
    collectionName: string;
    update: Uint8Array;
  } | null {
    try {
      if (bytes.length < 2) return null;
      // Read 2-byte big-endian name length
      const nameLen = (bytes[0]! << 8) | bytes[1]!;
      if (bytes.length < 2 + nameLen) return null;
      const nameBytes = bytes.slice(2, 2 + nameLen);
      const update = bytes.slice(2 + nameLen);
      return {
        collectionName: new TextDecoder().decode(nameBytes),
        update,
      };
    } catch {
      return null;
    }
  }

  private updateState(partial: Partial<SyncState>): void {
    this._state = { ...this._state, ...partial };
    this.emit("state:change", this._state);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  // Process in chunks to avoid call-stack overflow on large payloads
  const CHUNK_SIZE = 0x2000; // 8 KB
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
