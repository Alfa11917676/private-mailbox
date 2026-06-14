import type { MessageDetail } from "./api.ts";

export interface Draft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  showCc: boolean;
  showBcc: boolean;
}

export function emptyDraft(): Draft {
  return {
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    showCc: false,
    showBcc: false,
  };
}

function withPrefix(subject: string, prefix: "Re:" | "Fwd:"): string {
  const re = prefix === "Re:" ? /^re:/i : /^fwd?:/i;
  return re.test(subject.trim()) ? subject : `${prefix} ${subject}`;
}

function quote(text: string): string {
  return (text || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "";
}

// Split a comma-separated address header into trimmed, non-empty parts.
function splitAddresses(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildReferences(msg: MessageDetail): string | undefined {
  const parts = [msg.references, msg.messageId].filter(Boolean) as string[];
  return parts.length ? parts.join(" ") : undefined;
}

export function replyDraft(msg: MessageDetail): Draft {
  return {
    ...emptyDraft(),
    to: msg.from,
    subject: withPrefix(msg.subject, "Re:"),
    body: `\n\nOn ${formatDate(msg.date)}, ${msg.from} wrote:\n${quote(msg.text)}`,
    inReplyTo: msg.messageId ?? undefined,
    references: buildReferences(msg),
  };
}

export function replyAllDraft(msg: MessageDetail, self?: string): Draft {
  const selfLc = self?.toLowerCase();
  const fromLc = msg.from.toLowerCase();
  const seen = new Set<string>();
  const cc = [...splitAddresses(msg.to), ...splitAddresses(msg.cc)].filter((addr) => {
    const lc = addr.toLowerCase();
    if (lc === fromLc) return false; // already in To
    if (selfLc && lc.includes(selfLc)) return false; // drop ourselves
    if (seen.has(lc)) return false;
    seen.add(lc);
    return true;
  });
  const base = replyDraft(msg);
  return { ...base, cc: cc.join(", "), showCc: cc.length > 0 };
}

export function forwardDraft(msg: MessageDetail): Draft {
  const header =
    `\n\n---------- Forwarded message ----------\n` +
    `From: ${msg.from}\n` +
    `Date: ${formatDate(msg.date)}\n` +
    `Subject: ${msg.subject}\n` +
    `To: ${msg.to}\n\n`;
  return {
    ...emptyDraft(),
    subject: withPrefix(msg.subject, "Fwd:"),
    body: header + msg.text,
  };
}
