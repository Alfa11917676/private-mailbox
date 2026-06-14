import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      // Treat already-fetched data as fresh briefly so navigating back to a
      // folder/page/message is instant instead of re-hitting the mail server.
      staleTime: 30_000,
      // Keep cached + prefetched data around long enough to be useful.
      gcTime: 30 * 60_000,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
