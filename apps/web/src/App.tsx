import { useState, useEffect } from "react";
import { authClient } from "./auth";
import type { ApiResponse, HealthResponse } from "@arena/types";

const API_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

type Passkey = { id: string; name?: string | null; createdAt?: Date | null };

function App() {
  const { data: session, isPending } = authClient.useSession();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) {
      authClient.passkey.listUserPasskeys().then(({ data }) => {
        if (data) setPasskeys(data);
      });
    } else {
      setPasskeys([]);
    }
  }, [session]);

  async function fetchHealth() {
    try {
      const r = await fetch(`${API_BASE}/api/health`, { credentials: "include" });
      const body = (await r.json()) as ApiResponse<HealthResponse>;
      if (body.ok) setHealth(body.data);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.anonymous();
      if (result.error) throw new Error(String(result.error.message ?? result.error.statusText));
      const pk = await authClient.passkey.addPasskey();
      if (pk?.error) throw new Error(String(pk.error.message ?? pk.error.statusText));
      await fetchHealth();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw new Error(String(result.error.message ?? result.error.statusText));
      await fetchHealth();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
    setHealth(null);
    setError(null);
  }

  async function handleDeletePasskey(id: string) {
    await authClient.passkey.deletePasskey({ id });
    setPasskeys((prev) => prev.filter((p) => p.id !== id));
  }

  if (isPending) {
    return (
      <main className="min-h-screen bg-gray-50 font-mono p-8">
        <h1 className="text-2xl font-bold mb-4">arena</h1>
        <p className="text-gray-500">loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 font-mono p-8">
      <h1 className="text-2xl font-bold mb-6">arena</h1>

      {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}

      {session ? (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded p-4 text-sm">
            <p className="text-gray-500 mb-1">signed in as</p>
            <p className="font-medium">{session.user.id}</p>
          </div>

          {passkeys.length > 0 && (
            <div className="bg-white border border-gray-200 rounded p-4 text-sm">
              <p className="text-gray-500 mb-2">passkeys</p>
              <ul className="space-y-1">
                {passkeys.map((pk) => (
                  <li key={pk.id} className="flex items-center justify-between gap-4">
                    <span className="text-gray-700">{pk.name ?? pk.id.slice(0, 8)}</span>
                    <button
                      onClick={() => handleDeletePasskey(pk.id)}
                      className="text-red-500 text-xs hover:underline"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {health ? (
            <pre className="bg-white border border-gray-200 rounded p-4 text-sm">
              {JSON.stringify(health, null, 2)}
            </pre>
          ) : (
            <button
              onClick={fetchHealth}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700"
            >
              fetch health
            </button>
          )}

          <button
            onClick={handleSignOut}
            className="block mt-6 px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-100"
          >
            sign out
          </button>
        </div>
      ) : (
        <div className="space-y-3 max-w-xs">
          <button
            onClick={handleRegister}
            disabled={busy}
            className="w-full px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? "working..." : "register with passkey"}
          </button>
          <button
            onClick={handleSignIn}
            disabled={busy}
            className="w-full px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-100 disabled:opacity-50"
          >
            {busy ? "working..." : "sign in with passkey"}
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
