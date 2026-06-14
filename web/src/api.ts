// Typed client for our own JSON API. The browser never speaks IMAP/SMTP — it
// only talks to these endpoints (CLAUDE.md hard constraint).

export interface Folder {
  path: string;
  name: string;
  specialUse: string | null;
  subscribed: boolean;
}

export interface MessageSummary {
  uid: number;
  seq: number;
  subject: string;
  from: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  size: number | null;
  folder?: string;
}

// Virtual sidebar entry id for the cross-folder Starred view.
export const STARRED_FOLDER = "__starred__";

export interface MessageList {
  messages: MessageSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface MessageDetail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string | null;
  html: string;
  text: string;
  hasRemoteImages: boolean;
  attachments: Attachment[];
  seen: boolean;
  flagged: boolean;
  messageId: string | null;
  references: string | null;
}

export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
  size: number;
}

export interface SendPayload {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  attachments: { filename: string; contentType: string; contentBase64: string }[];
}

// Above this message size, the client asks the server for the lean body-only
// fetch so large attachments aren't downloaded just to render the body.
export const LIGHT_MESSAGE_BYTES = 512 * 1024;

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(err?.code ?? "error", err?.message ?? res.statusText, res.status);
  }
  return data as T;
}

// --- CSRF token (cached; refreshed on demand) ---------------------------
let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const { token } = await request<{ token: string }>("/api/csrf-token");
  csrfToken = token;
  return token;
}

async function postWithCsrf<T>(path: string, body: unknown): Promise<T> {
  const send = async () =>
    request<T>(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": await getCsrfToken(),
      },
      body: JSON.stringify(body),
    });
  try {
    return await send();
  } catch (err) {
    // Token may have expired — refresh once and retry.
    if (err instanceof ApiError && err.status === 403) {
      csrfToken = null;
      return send();
    }
    throw err;
  }
}

// --- Endpoints ----------------------------------------------------------
export const api = {
  getSession: () =>
    request<{ authenticated: boolean; address?: string }>("/api/session"),

  login: (passphrase: string) =>
    request<{ ok: true }>("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    }),

  logout: async () => {
    csrfToken = null;
    return request<{ ok: true }>("/api/logout", { method: "POST" });
  },

  getFolders: () => request<{ folders: Folder[] }>("/api/folders"),

  getStarred: () => request<{ messages: MessageSummary[] }>("/api/starred"),

  getMessages: (folder: string, page: number) =>
    request<MessageList>(
      `/api/messages?folder=${encodeURIComponent(folder)}&page=${page}`,
    ),

  getMessage: (folder: string, uid: number, images: boolean, light = false) =>
    request<MessageDetail>(
      `/api/messages/${uid}?folder=${encodeURIComponent(folder)}${
        images ? "&images=1" : ""
      }${light ? "&light=1" : ""}`,
    ),

  markRead: (folder: string, uid: number, seen: boolean) =>
    postWithCsrf<{ ok: true }>(`/api/messages/${uid}/read`, { folder, seen }),

  setFlag: (folder: string, uid: number, flagged: boolean) =>
    postWithCsrf<{ ok: true }>(`/api/messages/${uid}/flag`, { folder, flagged }),

  deleteMessage: (folder: string, uid: number) =>
    postWithCsrf<{ ok: true }>(`/api/messages/${uid}/delete`, { folder }),

  send: (payload: SendPayload) => postWithCsrf<{ ok: true }>("/api/send", payload),
};
