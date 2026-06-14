import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";
import Login from "./components/Login.tsx";
import Mailbox from "./components/Mailbox.tsx";

export default function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: api.getSession,
  });

  if (session.isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-400 flex items-center justify-center">
        Loading…
      </div>
    );
  }

  return session.data?.authenticated ? <Mailbox /> : <Login />;
}
