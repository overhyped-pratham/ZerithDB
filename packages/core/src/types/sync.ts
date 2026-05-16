/** A CRDT update payload to be applied or transmitted to peers. */
export interface SyncUpdate {
  /** Name of the collection this update belongs to */
  collectionName: string;
  /** Binary-encoded Yjs state delta */
  update: Uint8Array;
  /** Origin identifier — `null` for locally-initiated updates */
  origin: string | null;
}

/** Snapshot of the current synchronization status. */
export interface SyncState {
  /** Whether the local state is fully synced with all connected peers */
  synced: boolean;
  /** Number of outbound updates waiting to be sent */
  pendingUpdates: number;
  /** Number of currently connected peers */
  connectedPeers: number;
}

/** Ephemeral presence state shared via the Yjs Awareness protocol. */
export interface AwarenessState {
  /** Peer ID of the user */
  peerId: string;
  /** W3C DID Key identifier of the user */
  did: string;
  /** Optional cursor position for collaborative editing */
  cursor?: { line: number; column: number };
  /** Arbitrary additional presence metadata */
  [key: string]: unknown;
}
