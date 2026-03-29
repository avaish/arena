import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "../auth";

type Props = {
  session: { user: { id: string } } | null;
};

export default function NavBar({ session }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.anonymous();
      if (result.error) throw new Error(String(result.error.message ?? result.error.statusText));
      const pk = await authClient.passkey.addPasskey();
      if (pk?.error) throw new Error(String(pk.error.message ?? pk.error.statusText));
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
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
  }

  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold">
            arena
          </Link>
          {session && (
            <Link to="/settings" className="text-sm text-gray-500 hover:text-gray-900">
              settings
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {error && <span className="text-red-500 text-xs">{error}</span>}
          {session ? (
            <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-gray-900">
              sign out
            </button>
          ) : (
            <>
              <button
                onClick={handleSignIn}
                disabled={busy}
                className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
              >
                {busy ? "..." : "sign in"}
              </button>
              <button
                onClick={handleRegister}
                disabled={busy}
                className="px-3 py-1 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
              >
                {busy ? "..." : "register"}
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
