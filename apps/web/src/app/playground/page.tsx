"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  Laptop,
  Save,
  Database,
  ArrowRightLeft,
  Copy,
  Check,
} from "lucide-react";

type Note = {
  id: string;
  text: string;
  timestamp: number;
};

type Toast = {
  id: string;
  message: string;
  type: "success" | "error";
};

// Helper to generate mock Ed25519 did:key identifiers
async function generateMockDID(): Promise<string> {
  // Generate a random 64-character hex string as mock Ed25519 public key
  const mockPublicKey = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `did:key:z${mockPublicKey}`;
}

export default function PlaygroundPage() {
  const [isOnline, setIsOnline] = useState(true);

  // Simulated local state for Client A and Client B
  const [clientA, setClientA] = useState<Note[]>(() => [
    { id: "1", text: "Hello from Client A!", timestamp: Date.now() },
  ]);
  const [clientB, setClientB] = useState<Note[]>(() => [
    { id: "1", text: "Hello from Client A!", timestamp: Date.now() },
  ]);

  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");

  const [syncCount, setSyncCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [peerStatus, setPeerStatus] = useState<"connecting" | "connected" | "offline">(
    "connecting"
  );

  // Simulate DB initialization on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setPeerStatus("connected");
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Update peer status when network changes
  useEffect(() => {
    if (!isOnline) {
      setPeerStatus("offline"); // eslint-disable-line react-hooks/set-state-in-effect
    } else {
      setPeerStatus("connecting");
      const timer = setTimeout(() => setPeerStatus("connected"), 1000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  // Identity and toast state
  const [identityA, setIdentityA] = useState<string>("");
  const [identityB, setIdentityB] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Use a ref for timeouts to prevent re-renders and cleanup bugs
  const toastTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());

  // Generate identities on mount to avoid hydration mismatch
  useEffect(() => {
    (async () => {
      const didA = await generateMockDID();
      const didB = await generateMockDID();
      setIdentityA(didA);
      setIdentityB(didB);
    })();
  }, []);

  // Cleanup all timeouts only on component unmount
  useEffect(() => {
    const timeouts = toastTimeouts.current;
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);

    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimeouts.current.delete(timeout);
    }, 2000);

    toastTimeouts.current.add(timeout);
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    if (!text.trim()) {
      showToast("Failed to copy", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard!", "success");
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  // Sync logic simulation
  useEffect(() => {
    if (isOnline) {
      // Very basic CRDT mock: union of both sets based on ID, highest timestamp wins
      const merged = [...clientA, ...clientB].reduce((acc, curr) => {
        const existing = acc.find((n) => n.id === curr.id);
        if (!existing) {
          acc.push(curr);
        } else if (curr.timestamp > existing.timestamp) {
          existing.text = curr.text;
          existing.timestamp = curr.timestamp;
        }
        return acc;
      }, [] as Note[]);

      // Only update if there's an actual difference to prevent infinite loops
      if (JSON.stringify(merged) !== JSON.stringify(clientA)) setClientA(merged); // eslint-disable-line react-hooks/set-state-in-effect
      if (JSON.stringify(merged) !== JSON.stringify(clientB)) setClientB(merged);

      if (clientA.length > 0 || clientB.length > 0) {
        setSyncCount((prev) => prev + 1);
      }
    }
  }, [clientA, clientB, isOnline]);

  const addNote = (client: "A" | "B", text: string) => {
    if (!text.trim()) return;
    const newNote = { id: Math.random().toString(36).substring(7), text, timestamp: Date.now() };

    if (client === "A") {
      setClientA([...clientA, newNote]);
      setInputA("");
    } else {
      setClientB([...clientB, newNote]);
      setInputB("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 px-6 h-16 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-gray-500 hover:text-black transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div className="h-4 w-px bg-gray-300"></div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/logo.svg" alt="ZerithDB Logo" className="w-full h-full" />
            </div>
            <span className="font-semibold text-gray-900 text-lg tracking-tight">
              Interactive Playground
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            CRDT Sync Operations: {syncCount}
          </div>

          <div
            className={`hidden md:flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${
              peerStatus === "connected"
                ? "bg-green-50 text-green-700"
                : peerStatus === "connecting"
                  ? "bg-yellow-50 text-yellow-700"
                  : "bg-gray-100 text-gray-500"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                peerStatus === "connected"
                  ? "bg-green-500"
                  : peerStatus === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-gray-400"
              }`}
            />
            {peerStatus === "connected"
              ? "Peers Connected"
              : peerStatus === "connecting"
                ? "Connecting to Peers..."
                : "Peers Offline"}
          </div>
          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border ${
              isOnline
                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            }`}
          >
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isOnline ? "Network: Online (P2P)" : "Network: Offline"}
          </button>
        </div>
      </header>

      {/* MAIN PLAYGROUND */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid md:grid-cols-2 gap-8 items-start mt-8">
        {/* CLIENT A */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col h-[600px]">
          <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-2 text-white">
              <Laptop className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold tracking-wide">Browser A (Alice)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              <Database className="w-3.5 h-3.5" /> IndexedDB Active
            </div>
          </div>

          {/* Identity Display */}
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-100">
            <div className="text-xs font-semibold text-blue-900 mb-2 uppercase tracking-wide">
              Identity (Ed25519 Mock)
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-200">
              <code className="text-xs text-blue-700 font-mono flex-1 truncate">
                {identityA || "(generating...)"}
              </code>
              <button
                onClick={() => copyToClipboard(identityA)}
                disabled={!identityA}
                className="ml-2 p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 disabled:text-gray-400 disabled:hover:bg-transparent rounded transition-colors flex-shrink-0"
                title={identityA ? "Copy public key" : "Loading..."}
                aria-label="Copy Browser A public key"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-white p-4 rounded-xl border border-gray-100 animate-pulse"
                  >
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : clientA.length === 0 ? (
              <div className="text-center text-gray-400 mt-20 text-sm">
                No documents. Type below to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {clientA.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <p className="text-gray-800">{note.text}</p>
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wider font-mono">
                      ID: {note.id} • {new Date(note.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-100">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addNote("A", inputA);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={inputA}
                onChange={(e) => setInputA(e.target.value)}
                placeholder="Type a message offline/online..."
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </form>
          </div>
        </div>

        {/* CLIENT B */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col h-[600px]">
          <div className="bg-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-2 text-white">
              <Laptop className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold tracking-wide">Browser B (Bob)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              <Database className="w-3.5 h-3.5" /> IndexedDB Active
            </div>
          </div>

          {/* Identity Display */}
          <div className="bg-purple-50 px-4 py-3 border-b border-purple-100">
            <div className="text-xs font-semibold text-purple-900 mb-2 uppercase tracking-wide">
              Identity (Ed25519 Mock)
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-purple-200">
              <code className="text-xs text-purple-700 font-mono flex-1 truncate">
                {identityB || "(generating...)"}
              </code>
              <button
                onClick={() => copyToClipboard(identityB)}
                disabled={!identityB}
                className="ml-2 p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-100 disabled:text-gray-400 disabled:hover:bg-transparent rounded transition-colors flex-shrink-0"
                title={identityB ? "Copy public key" : "Loading..."}
                aria-label="Copy Browser B public key"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-white p-4 rounded-xl border border-gray-100 animate-pulse"
                  >
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : clientB.length === 0 ? (
              <div className="text-center text-gray-400 mt-20 text-sm">
                No documents. Type below to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {clientB.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  >
                    <p className="text-gray-800">{note.text}</p>
                    <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-wider font-mono">
                      ID: {note.id} • {new Date(note.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-100">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addNote("B", inputB);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={inputB}
                onChange={(e) => setInputB(e.target.value)}
                placeholder="Type a message offline/online..."
                className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              />
              <button
                type="submit"
                className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* INFO FOOTER */}
      <div className="max-w-3xl mx-auto text-center pb-12 px-6">
        <h3 className="font-semibold text-gray-900 mb-2">How to test the Playground:</h3>
        <ul className="text-sm text-gray-500 flex flex-col gap-2">
          <li>
            1. Type a message in Browser A and click Save. See it instantly sync to Browser B.
          </li>
          <li>
            2. Click the <strong className="text-red-600">Network: Online</strong> button to
            simulate going offline.
          </li>
          <li>
            3. Create different notes in Browser A and Browser B. Notice they don&apos;t sync.
          </li>
          <li>
            4. Click <strong className="text-green-600">Network: Offline</strong> to reconnect.
            Watch the CRDT engine automatically merge the states perfectly!
          </li>
        </ul>
      </div>

      {/* Toast Notifications */}
      <div
        className="fixed bottom-6 right-6 flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto ${
              toast.type === "success"
                ? "bg-black text-white"
                : "bg-red-100 text-red-900 border border-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <span className="text-lg">✕</span>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
