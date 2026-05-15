import React, { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createApp } from "zerithdb-sdk";
import type { ZerithDBConfig } from "zerithdb-sdk";
import type { ZerithDBApp } from "zerithdb-sdk";

const ZerithContext = createContext<ZerithDBApp | null>(null);

export interface ZerithProviderProps {
  config: ZerithDBConfig;
  children: React.ReactNode;
}

/**
 * Global provider for ZerithDB.
 * Initializes the P2P client and makes it available via hooks.
 * Disposes the previous client on config change or unmount to prevent
 * memory/connection leaks.
 */
export const ZerithProvider: React.FC<ZerithProviderProps> = ({ config, children }) => {
  const configKey = JSON.stringify(config);
  const client = useMemo(() => createApp(config), [configKey]);

  // Dispose on unmount or when config changes (new client replaces old one)
  useEffect(() => {
    return () => {
      void client.dispose();
    };
  }, [client]);

  return <ZerithContext.Provider value={client}>{children}</ZerithContext.Provider>;
};

/**
 * Access the underlying ZerithDB client directly.
 */
export const useZerith = (): ZerithDBApp => {
  const context = useContext(ZerithContext);
  if (!context) {
    throw new Error("useZerith must be used within a ZerithProvider");
  }
  return context;
};

/**
 * Reactive hook to query a collection.
 * Polls the local database on an interval to pick up local and remote changes.
 *
 * NOTE: A proper subscription-based API (`liveQuery`) is on the roadmap.
 * This polling approach is a pragmatic stopgap.
 */
export function useQuery<T extends Record<string, any> = Record<string, any>>(
  collectionName: string,
  pollIntervalMs = 1000
) {
  const app = useZerith();
  const [data, setData] = useState<(T & { _id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    const collection = app.db<T>(collectionName);

    const poll = async () => {
      try {
        const docs = await collection.find({});
        if (mounted) {
          setData(docs as (T & { _id: string })[]);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      }
    };

    // Initial fetch
    void poll();

    // Poll for updates (CRDT merges, local writes from other tabs, etc.)
    const timer = setInterval(poll, pollIntervalMs);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [app, collectionName, pollIntervalMs]);

  const insert = useCallback(
    async (item: T) => {
      return app.db<T>(collectionName).insert(item);
    },
    [app, collectionName]
  );

  const remove = useCallback(
    async (id: string) => {
      // delete() takes a QueryFilter, not a raw id string
      return app.db<T>(collectionName).delete({ _id: id } as any);
    },
    [app, collectionName]
  );

  return { data, loading, error, insert, remove };
}
