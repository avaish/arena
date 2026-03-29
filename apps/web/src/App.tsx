import { Outlet } from "@tanstack/react-router";
import { authClient } from "./auth";
import NavBar from "./components/NavBar";

function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <main className="min-h-screen bg-gray-50 font-mono p-8">
        <p className="text-gray-500">loading...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-mono">
      <NavBar session={session} />
      <main className="max-w-3xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default App;
