import { useEffect, useRef } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { LIGHT_MESSAGE_BYTES, STARRED_FOLDER, api, type MessageSummary } from "../api.ts";
import { StarFilledIcon } from "../icons.tsx";
import { avatarStyle, initial } from "../ui.ts";

interface Props {
  folder: string;
  page: number;
  onPageChange: (page: number) => void;
  selectedUid: number | null;
  onSelect: (uid: number, size: number | null, folder: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const isLight = (size: number | null) => (size ?? 0) > LIGHT_MESSAGE_BYTES;

export default function MessageList({
  folder,
  page,
  onPageChange,
  selectedUid,
  onSelect,
}: Props) {
  const queryClient = useQueryClient();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStarred = folder === STARRED_FOLDER;

  const list = useQuery({
    queryKey: ["messages", folder, page],
    queryFn: () => api.getMessages(folder, page),
    placeholderData: keepPreviousData,
    enabled: !isStarred,
  });

  const starred = useQuery({
    queryKey: ["starred"],
    queryFn: api.getStarred,
    enabled: isStarred,
    staleTime: 30_000,
  });

  function realFolder(m: MessageSummary): string {
    return isStarred ? m.folder ?? "INBOX" : folder;
  }

  function prefetchOnHover(m: MessageSummary) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const f = realFolder(m);
    const light = isLight(m.size);
    hoverTimer.current = setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: ["message", f, m.uid, false, light],
        queryFn: () => api.getMessage(f, m.uid, false, light),
        staleTime: Infinity,
      });
    }, 120);
  }
  function cancelHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }

  const totalPages = list.data?.totalPages ?? 1;
  useEffect(() => {
    if (!isStarred && page < totalPages) {
      void queryClient.prefetchQuery({
        queryKey: ["messages", folder, page + 1],
        queryFn: () => api.getMessages(folder, page + 1),
      });
    }
  }, [queryClient, folder, page, totalPages, isStarred]);

  const loading = isStarred ? starred.isLoading : list.isLoading;
  const error = isStarred ? starred.isError : list.isError;
  const messages = isStarred ? starred.data?.messages ?? [] : list.data?.messages ?? [];

  if (loading) {
    return <p className="p-3 text-xs text-slate-500">Loading messages…</p>;
  }
  if (error) {
    return <p className="p-3 text-xs text-red-400">Couldn’t load messages.</p>;
  }
  if (messages.length === 0) {
    return (
      <p className="p-3 text-xs text-slate-500">
        {isStarred ? "No starred messages yet." : "No messages in this folder."}
      </p>
    );
  }

  return (
    <>
      <ul className="flex-1 overflow-y-auto p-1.5">
        {messages.map((m) => {
          const unread = !m.seen;
          const active = m.uid === selectedUid;
          return (
            <li key={`${m.folder ?? folder}-${m.uid}`}>
              <button
                onClick={() => onSelect(m.uid, m.size, realFolder(m))}
                onMouseEnter={() => prefetchOnHover(m)}
                onMouseLeave={cancelHover}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-white/[0.07] ring-1 ring-inset ring-white/10" : "hover:bg-white/5"
                }`}
              >
                <span
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={avatarStyle(m.from)}
                >
                  {initial(m.from)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex-1 truncate text-sm ${
                        unread ? "font-semibold text-white" : "text-slate-300"
                      }`}
                    >
                      {m.from}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {formatDate(m.date)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex-1 truncate text-sm ${
                        unread ? "text-slate-200" : "text-slate-400"
                      }`}
                    >
                      {m.subject}
                    </span>
                    {m.flagged && (
                      <StarFilledIcon width={13} height={13} className="shrink-0 text-amber-400" />
                    )}
                    {unread && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-4 py-2 text-xs text-slate-400">
        {isStarred ? (
          <span>
            {messages.length} starred message{messages.length === 1 ? "" : "s"}
          </span>
        ) : (
          <>
            <span>
              {list.data?.total ?? 0} message{(list.data?.total ?? 0) === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-3">
              <button
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-white/5 hover:text-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ← Prev
              </button>
              <span>
                {list.data?.page ?? 1} / {list.data?.totalPages ?? 1}
              </span>
              <button
                disabled={page >= (list.data?.totalPages ?? 1)}
                onClick={() => onPageChange(page + 1)}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-white/5 hover:text-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
