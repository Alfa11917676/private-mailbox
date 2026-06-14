import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError, api, type OutgoingAttachment } from "../api.ts";
import type { Draft } from "../draft.ts";
import { CloseIcon, ImageIcon, PaperclipIcon, SendIcon } from "../icons.tsx";

const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

interface Props {
  open: boolean;
  draft: Draft;
  draftKey: number;
  onClose: () => void;
  onSent: () => void;
}

function splitAddresses(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readFile(file: File): Promise<OutgoingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const result = String(reader.result);
      const base64 = result.slice(result.indexOf(",") + 1);
      resolve({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentBase64: base64,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

export default function Compose({ open, draft, draftKey, onClose, onSent }: Props) {
  const [form, setForm] = useState<Draft>(draft);
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  // Re-seed the form each time a new draft is opened.
  useEffect(() => {
    setForm(draft);
    setAttachments([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const totalBytes = attachments.reduce((s, a) => s + a.size, 0);
  const overLimit = totalBytes > MAX_TOTAL_BYTES;
  const hasRecipients =
    splitAddresses(form.to).length +
      splitAddresses(form.cc).length +
      splitAddresses(form.bcc).length >
    0;

  const send = useMutation({
    mutationFn: () =>
      api.send({
        to: splitAddresses(form.to),
        cc: splitAddresses(form.cc),
        bcc: splitAddresses(form.bcc),
        subject: form.subject,
        text: form.body,
        inReplyTo: form.inReplyTo,
        references: form.references,
        attachments: attachments.map(({ filename, contentType, contentBase64 }) => ({
          filename,
          contentType,
          contentBase64,
        })),
      }),
    onSuccess: onSent,
  });

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const read = await Promise.all(Array.from(list).map(readFile));
    setAttachments((prev) => [...prev, ...read]);
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const sendError =
    send.error instanceof ApiError ? send.error.message : send.error ? "Send failed." : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">New message</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <Field label="To">
            <div className="flex items-center gap-2">
              <input
                value={form.to}
                onChange={(e) => set("to", e.target.value)}
                placeholder="name@example.com, …"
                className="flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
              {!form.showCc && (
                <ToggleLink onClick={() => set("showCc", true)}>Cc</ToggleLink>
              )}
              {!form.showBcc && (
                <ToggleLink onClick={() => set("showBcc", true)}>Bcc</ToggleLink>
              )}
            </div>
          </Field>

          {form.showCc && (
            <Field label="Cc">
              <input
                value={form.cc}
                onChange={(e) => set("cc", e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </Field>
          )}
          {form.showBcc && (
            <Field label="Bcc">
              <input
                value={form.bcc}
                onChange={(e) => set("bcc", e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </Field>
          )}

          <Field label="Subject">
            <input
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </Field>

          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            placeholder="Write your message…"
            className="w-full min-h-64 resize-y rounded-lg bg-slate-950/50 border border-white/10 p-3 text-sm outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-white/10"
          />

          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <li
                  key={`${a.filename}-${i}`}
                  className="flex items-center gap-2 rounded border border-white/10 bg-slate-950/50 px-2 py-1 text-xs text-slate-300"
                >
                  <span className="truncate max-w-48">{a.filename}</span>
                  <span className="text-slate-500">{formatBytes(a.size)}</span>
                  <button
                    onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                    className="text-slate-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-white/10 px-4 py-3 space-y-2">
          {(overLimit || sendError) && (
            <p className="text-xs text-red-400">
              {overLimit ? "Attachments exceed the 15 MB limit." : sendError}
            </p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <IconButton title="Attach file" onClick={() => fileRef.current?.click()}>
                <PaperclipIcon />
              </IconButton>
              <IconButton title="Add image" onClick={() => imageRef.current?.click()}>
                <ImageIcon />
              </IconButton>
              {totalBytes > 0 && (
                <span className="ml-1 text-xs text-slate-500">
                  {formatBytes(totalBytes)}
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <button
              onClick={() => send.mutate()}
              disabled={!hasRecipients || overLimit || send.isPending}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 active:scale-95 disabled:opacity-40"
            >
              <SendIcon width={14} height={14} />
              {send.isPending ? "Sending…" : "Send"}
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-white/10 pb-2">
      <span className="w-14 shrink-0 text-xs text-slate-500">{label}</span>
      <div className="flex-1 text-slate-100">{children}</div>
    </div>
  );
}

function ToggleLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="text-xs text-slate-500 hover:text-slate-200">
      {children}
    </button>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded p-2 text-slate-400 hover:bg-white/5 hover:text-slate-100"
    >
      {children}
    </button>
  );
}
