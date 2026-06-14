import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { type Draft, emptyDraft } from "../draft.ts";
import { ComposeIcon, InboxIcon } from "../icons.tsx";
import Compose from "./Compose.tsx";
import FolderList from "./FolderList.tsx";
import MessageList from "./MessageList.tsx";
import MessageView from "./MessageView.tsx";

interface ComposeState {
  open: boolean;
  draft: Draft;
  key: number;
}

interface Selection {
  uid: number;
  size: number | null;
  folder: string;
}

export default function Mailbox() {
  const [folder, setFolder] = useState("INBOX");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [compose, setCompose] = useState<ComposeState>({
    open: false,
    draft: emptyDraft(),
    key: 0,
  });
  const queryClient = useQueryClient();

  const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });

  function selectFolder(path: string) {
    setFolder(path);
    setPage(1);
    setSelected(null);
  }

  function openCompose(draft: Draft) {
    setCompose((c) => ({ open: true, draft, key: c.key + 1 }));
  }

  return (
    <div className="app-bg h-screen flex flex-col text-slate-100">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-slate-100">
            <InboxIcon width={15} height={15} />
          </div>
          <h1 className="text-sm font-semibold">
            Mailbox <span className="text-slate-500">— arnabray.me</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openCompose(emptyDraft())}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 active:scale-95"
          >
            <ComposeIcon width={14} height={14} />
            New message
          </button>
          <button
            onClick={() => logout.mutate()}
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-white/10 p-2">
          <FolderList selected={folder} onSelect={selectFolder} />
        </aside>

        <section className="flex w-96 shrink-0 flex-col border-r border-white/10 min-h-0">
          <MessageList
            folder={folder}
            page={page}
            onPageChange={setPage}
            selectedUid={selected?.uid ?? null}
            onSelect={(uid, size, realFolder) =>
              setSelected({ uid, size, folder: realFolder })
            }
          />
        </section>

        <main className="flex min-w-0 flex-1 flex-col min-h-0">
          <MessageView
            folder={selected?.folder ?? "INBOX"}
            uid={selected?.uid ?? null}
            size={selected?.size ?? null}
            accountAddress={session.data?.address}
            onCompose={openCompose}
            onDeleted={() => setSelected(null)}
          />
        </main>
      </div>

      <Compose
        open={compose.open}
        draft={compose.draft}
        draftKey={compose.key}
        onClose={() => setCompose((c) => ({ ...c, open: false }))}
        onSent={() => {
          setCompose((c) => ({ ...c, open: false }));
          void queryClient.invalidateQueries({ queryKey: ["messages"] });
        }}
      />
    </div>
  );
}
