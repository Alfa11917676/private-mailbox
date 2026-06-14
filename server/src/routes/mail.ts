import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth.js";
import { badRequest } from "../errors.js";
import {
  deleteMessage,
  getMessage,
  listFolders,
  listMessages,
  listStarred,
  MAX_ATTACHMENT_BYTES,
  sendMessage,
  setFlagged,
  setSeen,
  type SendInput,
} from "../mailService.js";

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface RawAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

function parseAttachments(value: unknown): RawAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.map((a) => {
    const obj = (a ?? {}) as Record<string, unknown>;
    return {
      filename: typeof obj.filename === "string" ? obj.filename : "attachment",
      contentType:
        typeof obj.contentType === "string"
          ? obj.contentType
          : "application/octet-stream",
      contentBase64: typeof obj.contentBase64 === "string" ? obj.contentBase64 : "",
    };
  });
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function isTruthyFlag(value: unknown): boolean {
  return value === "1" || value === "true";
}

export async function mailRoutes(app: FastifyInstance): Promise<void> {
  // Every mail route requires an authenticated session.
  app.addHook("preHandler", requireAuth);

  app.get("/api/folders", async () => {
    return { folders: await listFolders() };
  });

  app.get("/api/starred", async () => {
    return { messages: await listStarred() };
  });

  app.get("/api/messages", async (request) => {
    const query = request.query as { folder?: string; page?: string };
    const folder = query.folder?.trim() || "INBOX";
    const page = parsePositiveInt(query.page, 1);
    return listMessages(folder, page);
  });

  app.get("/api/messages/:uid", async (request) => {
    const params = request.params as { uid: string };
    const query = request.query as {
      folder?: string;
      images?: string;
      light?: string;
    };
    const uid = parsePositiveInt(params.uid, 0);
    if (uid === 0) throw badRequest("Invalid message uid");
    const folder = query.folder?.trim() || "INBOX";
    return getMessage(folder, uid, isTruthyFlag(query.images), isTruthyFlag(query.light));
  });

  // Mark read/unread — state-changing, so it requires the CSRF token.
  app.post(
    "/api/messages/:uid/read",
    { preHandler: app.csrfProtection },
    async (request) => {
      const params = request.params as { uid: string };
      const body = request.body as { seen?: unknown; folder?: unknown } | undefined;
      const uid = parsePositiveInt(params.uid, 0);
      if (uid === 0) throw badRequest("Invalid message uid");
      if (typeof body?.seen !== "boolean") {
        throw badRequest("Body must include boolean 'seen'");
      }
      const folder =
        typeof body.folder === "string" && body.folder.trim()
          ? body.folder.trim()
          : "INBOX";
      await setSeen(folder, uid, body.seen);
      return { ok: true };
    },
  );

  // Star / unstar (\\Flagged) — state-changing.
  app.post(
    "/api/messages/:uid/flag",
    { preHandler: app.csrfProtection },
    async (request) => {
      const params = request.params as { uid: string };
      const body = request.body as { folder?: unknown; flagged?: unknown } | undefined;
      const uid = parsePositiveInt(params.uid, 0);
      if (uid === 0) throw badRequest("Invalid message uid");
      if (typeof body?.flagged !== "boolean") {
        throw badRequest("Body must include boolean 'flagged'");
      }
      const folder =
        typeof body.folder === "string" && body.folder.trim()
          ? body.folder.trim()
          : "INBOX";
      await setFlagged(folder, uid, body.flagged);
      return { ok: true };
    },
  );

  // Delete (move to Trash, or expunge if already in Trash) — state-changing.
  app.post(
    "/api/messages/:uid/delete",
    { preHandler: app.csrfProtection },
    async (request) => {
      const params = request.params as { uid: string };
      const body = request.body as { folder?: unknown } | undefined;
      const uid = parsePositiveInt(params.uid, 0);
      if (uid === 0) throw badRequest("Invalid message uid");
      const folder =
        typeof body?.folder === "string" && body.folder.trim()
          ? body.folder.trim()
          : "INBOX";
      await deleteMessage(folder, uid);
      return { ok: true };
    },
  );

  // Compose + send (with attachments / cc / bcc) — state-changing.
  app.post("/api/send", { preHandler: app.csrfProtection }, async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const to = toStringArray(body.to);
    const cc = toStringArray(body.cc);
    const bcc = toStringArray(body.bcc);
    if (to.length + cc.length + bcc.length === 0) {
      throw badRequest("At least one recipient is required");
    }

    const attachments = parseAttachments(body.attachments);
    const totalBytes = attachments.reduce(
      (sum, a) => sum + Math.floor((a.contentBase64.length * 3) / 4),
      0,
    );
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw badRequest("Attachments exceed the 15 MB total limit");
    }

    const input: SendInput = {
      to,
      cc,
      bcc,
      subject: typeof body.subject === "string" ? body.subject : "",
      text: typeof body.text === "string" ? body.text : "",
      inReplyTo: typeof body.inReplyTo === "string" ? body.inReplyTo : undefined,
      references: typeof body.references === "string" ? body.references : undefined,
      attachments,
    };
    await sendMessage(input);
    return { ok: true };
  });
}
