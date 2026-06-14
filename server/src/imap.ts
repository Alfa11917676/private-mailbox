import { ImapFlow, type ListResponse, type MailboxLockObject } from "imapflow";
import { env } from "./env.js";

/**
 * Single long-lived IMAP connection, reused across requests (CLAUDE.md: "Reuse a
 * pooled IMAP connection; do not open a new one per request"). imapflow allows
 * only one mailbox open at a time, so all mailbox-scoped work goes through
 * `withMailbox`, which serializes access via getMailboxLock. The connection is
 * lazily (re)established and torn down on error so the next call reconnects.
 */
class ImapManager {
  private client: ImapFlow | null = null;
  private connecting: Promise<ImapFlow> | null = null;

  private async connect(): Promise<ImapFlow> {
    const client = new ImapFlow({
      host: env.imapHost,
      port: env.imapPort,
      secure: true,
      auth: { user: env.mailUser, pass: env.mailPassword },
      logger: false, // never echo credentials / message contents to logs
      emitLogs: false,
    });

    // If the socket drops, forget the client so the next call reconnects.
    const drop = () => {
      if (this.client === client) this.client = null;
    };
    client.on("close", drop);
    client.on("error", drop);

    await client.connect();
    this.client = client;
    return client;
  }

  private async getClient(): Promise<ImapFlow> {
    if (this.client?.usable) return this.client;
    if (!this.connecting) {
      this.connecting = this.connect().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  /** List all folders. LIST does not need a selected mailbox. */
  async listFolders(): Promise<ListResponse[]> {
    const client = await this.getClient();
    return client.list();
  }

  /**
   * Run `fn` with `path` selected and locked. The lock serializes concurrent
   * requests so two operations never fight over the single connection.
   */
  async withMailbox<T>(
    path: string,
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();
    let lock: MailboxLockObject | undefined;
    try {
      lock = await client.getMailboxLock(path);
      return await fn(client);
    } finally {
      lock?.release();
    }
  }

  /** Append a raw message to a folder (e.g. saving a sent message to Sent). */
  async append(
    path: string,
    content: Buffer,
    flags: string[] = [],
  ): Promise<void> {
    const client = await this.getClient();
    await client.append(path, content, flags);
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client?.usable) await client.logout().catch(() => undefined);
  }
}

export const imap = new ImapManager();
