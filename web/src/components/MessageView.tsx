import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  LIGHT_MESSAGE_BYTES,
  api,
  type MessageDetail,
  type MessageList,
  type MessageSummary,
} from "../api.ts";
import { type Draft, forwardDraft, replyAllDraft, replyDraft } from "../draft.ts";
import {
  FileIcon,
  ForwardIcon,
  ReplyAllIcon,
  ReplyIcon,
  StarFilledIcon,
  StarIcon,
  TrashIcon,
} from "../icons.tsx";
import { avatarStyle, initial } from "../ui.ts";

interface Props {
  folder: string;
  uid: number | null;
  size: number | null;
  accountAddress?: string;
  onCompose: (draft: Draft) => void;
  onDeleted: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFullDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function patchSeen(qc: QueryClient, folder: string, uid: number, seen: boolean): void {
  qc.setQueriesData<MessageList>({ queryKey: ["messages", folder] }, (old) =>
    old
      ? { ...old, messages: old.messages.map((m) => (m.uid === uid ? { ...m, seen } : m)) }
      : old,
  );
  qc.setQueriesData<MessageDetail>({ queryKey: ["message", folder, uid] }, (old) =>
    old ? { ...old, seen } : old,
  );
}

// Reflect a star toggle across the detail, folder lists, and the Starred view.
function patchFlagged(
  qc: QueryClient,
  folder: string,
  uid: number,
  flagged: boolean,
): void {
  qc.setQueriesData<MessageDetail>({ queryKey: ["message", folder, uid] }, (old) =>
    old ? { ...old, flagged } : old,
  );
  qc.setQueriesData<MessageList>({ queryKey: ["messages", folder] }, (old) =>
    old
      ? { ...old, messages: old.messages.map((m) => (m.uid === uid ? { ...m, flagged } : m)) }
      : old,
  );
  qc.setQueryData<{ messages: MessageSummary[] }>(["starred"], (old) => {
    if (!old) return old;
    const same = (m: MessageSummary) => m.uid === uid && (m.folder ?? folder) === folder;
    const messages = flagged
      ? old.messages.map((m) => (same(m) ? { ...m, flagged } : m))
      : old.messages.filter((m) => !same(m));
    return { ...old, messages };
  });
}

function buildSrcDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{font-family:system-ui,-apple-system,sans-serif;color:#e2e8f0;background:#0b1120;margin:14px;line-height:1.55;overflow-wrap:anywhere;}
    a{color:#7dd3fc;} img{max-width:100%;height:auto;} table{max-width:100%;}
    blockquote{border-left:3px solid #334155;margin:0;padding-left:12px;color:#94a3b8;}
  </style></head><body>${html}</body></html>`;
}

export default function MessageView({
  folder,
  uid,
  size,
  accountAddress,
  onCompose,
  onDeleted,
}: Props) {
  const [showImages, setShowImages] = useState(false);
  const queryClient = useQueryClient();
  const light = (size ?? 0) > LIGHT_MESSAGE_BYTES;

  useEffect(() => setShowImages(false), [uid]);

  const message = useQuery({
    queryKey: ["message", folder, uid, showImages, light],
    queryFn: () => api.getMessage(folder, uid as number, showImages, light),
    enabled: uid !== null,
    staleTime: Infinity,
  });

  const data = message.data;

  const setSeen = useMutation({
    mutationFn: (seen: boolean) => api.markRead(folder, uid as number, seen),
    onMutate: (seen: boolean) => {
      if (uid !== null) patchSeen(queryClient, folder, uid, seen);
    },
    onError: (_err, seen) => {
      if (uid !== null) patchSeen(queryClient, folder, uid, !seen);
    },
  });

  const setFlag = useMutation({
    mutationFn: (flagged: boolean) => api.setFlag(folder, uid as number, flagged),
    onMutate: (flagged: boolean) => {
      if (uid !== null) patchFlagged(queryClient, folder, uid, flagged);
    },
    onError: (_err, flagged) => {
      if (uid !== null) patchFlagged(queryClient, folder, uid, !flagged);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["starred"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteMessage(folder, uid as number),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", folder] });
      void queryClient.invalidateQueries({ queryKey: ["starred"] });
      onDeleted();
    },
  });

  useEffect(() => {
    if (data && !data.seen) setSeen.mutate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.uid, data?.seen]);

  if (uid === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-600">
        Select a message to read
      </div>
    );
  }
  if (message.isLoading) {
    return <p className="p-4 text-sm text-slate-500">Loading message…</p>;
  }
  if (message.isError || !data) {
    return <p className="p-4 text-sm text-red-400">Couldn’t load this message.</p>;
  }

  return (
    <article key={data.uid} className="flex min-h-0 flex-1 flex-col animate-fade-in">
      <Toolbar
        seen={data.seen}
        flagged={data.flagged}
        deleting={remove.isPending}
        onReply={() => onCompose(replyDraft(data))}
        onReplyAll={() => onCompose(replyAllDraft(data, accountAddress))}
        onForward={() => onCompose(forwardDraft(data))}
        onToggleFlag={() => setFlag.mutate(!data.flagged)}
        onDelete={() => remove.mutate()}
        onToggleSeen={() => setSeen.mutate(!data.seen)}
      />

      <Header data={data} />

      {data.attachments.length > 0 && <Attachments data={data} />}

      {data.hasRemoteImages && !showImages && (
        <div className="flex items-center justify-between border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-200">
          <span>Remote images blocked to protect your privacy.</span>
          <button
            onClick={() => setShowImages(true)}
            className="font-medium underline transition-colors hover:text-amber-100"
          >
            Load images
          </button>
        </div>
      )}

      <iframe
        title="Message body"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={buildSrcDoc(data.html)}
        className="w-full flex-1"
        style={{ background: "#0b1120" }}
      />
    </article>
  );
}

function Toolbar({
  seen,
  flagged,
  deleting,
  onReply,
  onReplyAll,
  onForward,
  onToggleFlag,
  onDelete,
  onToggleSeen,
}: {
  seen: boolean;
  flagged: boolean;
  deleting: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
  onToggleSeen: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-white/10 bg-white/[0.02] px-3 py-2">
      <ToolButton title="Reply" onClick={onReply}>
        <ReplyIcon />
      </ToolButton>
      <ToolButton title="Reply all" onClick={onReplyAll}>
        <ReplyAllIcon />
      </ToolButton>
      <ToolButton title="Forward" onClick={onForward}>
        <ForwardIcon />
      </ToolButton>
      <div className="mx-1 h-5 w-px bg-white/10" />
      <ToolButton title={flagged ? "Unstar" : "Star as important"} onClick={onToggleFlag}>
        {flagged ? (
          <StarFilledIcon className="text-amber-400" />
        ) : (
          <StarIcon />
        )}
      </ToolButton>
      <ToolButton title="Delete" onClick={onDelete} danger disabled={deleting}>
        <TrashIcon />
      </ToolButton>
      <button
        onClick={onToggleSeen}
        className="ml-auto rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
      >
        {seen ? "Mark unread" : "Mark read"}
      </button>
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  children,
  danger,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-2 transition-all active:scale-90 disabled:opacity-40 ${
        danger
          ? "text-slate-400 hover:bg-red-500/15 hover:text-red-300"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Header({ data }: { data: MessageDetail }) {
  return (
    <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
      <span
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-inner"
        style={avatarStyle(data.from)}
      >
        {initial(data.from)}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <h2 className="truncate text-base font-semibold text-white">{data.subject}</h2>
        <div className="truncate text-sm text-slate-300">{data.from}</div>
        <div className="truncate text-xs text-slate-500">
          {data.to && <span>to {data.to} · </span>}
          {formatFullDate(data.date)}
        </div>
      </div>
    </div>
  );
}

function Attachments({ data }: { data: MessageDetail }) {
  return (
    <div className="border-b border-white/10 px-4 py-2.5">
      <div className="mb-1.5 text-xs text-slate-500">
        {data.attachments.length} attachment{data.attachments.length === 1 ? "" : "s"}
      </div>
      <ul className="flex flex-wrap gap-2">
        {data.attachments.map((a, i) => (
          <li
            key={`${a.filename}-${i}`}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
            title={a.contentType}
          >
            <FileIcon width={14} height={14} className="text-slate-400" />
            <span className="max-w-48 truncate">{a.filename}</span>
            <span className="text-slate-500">{formatSize(a.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
