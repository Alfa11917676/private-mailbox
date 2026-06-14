import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api.ts";
import { InboxIcon } from "../icons.tsx";

export default function Login() {
  const [passphrase, setPassphrase] = useState("");
  const queryClient = useQueryClient();

  const login = useMutation({
    mutationFn: () => api.login(passphrase),
    onSuccess: () => {
      setPassphrase("");
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });

  const errorMessage =
    login.error instanceof ApiError
      ? login.error.status === 429
        ? "Too many attempts. Wait a minute and try again."
        : "Incorrect passphrase."
      : login.error
        ? "Something went wrong. Try again."
        : null;

  return (
    <main className="app-bg min-h-screen text-slate-100 flex items-center justify-center p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (passphrase) login.mutate();
        }}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl animate-pop-in"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-700 text-slate-100">
            <InboxIcon width={22} height={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Mailbox</h1>
            <p className="text-sm text-slate-400">arnabray.me</p>
          </div>
        </div>

        <input
          type="password"
          autoFocus
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="App passphrase"
          className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-white/10"
        />

        {errorMessage && (
          <p className="text-sm text-red-400" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={!passphrase || login.isPending}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50"
        >
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
