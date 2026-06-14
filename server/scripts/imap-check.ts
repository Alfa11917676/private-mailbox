/**
 * Standalone IMAP credential check.
 *
 * Connects to the configured IMAP server, lists the mailbox folders, and prints
 * them. Proves that the credentials in server/.env are valid and that TLS works.
 *
 * Run from the repo root:  pnpm imap-check
 * Or from server/:         pnpm imap-check
 *
 * Prints the auth username for context but NEVER the password.
 */
import { ImapFlow } from "imapflow";
import { env } from "../src/env.js";

async function main(): Promise<void> {
  const client = new ImapFlow({
    host: env.imapHost,
    port: env.imapPort,
    secure: true, // implicit TLS on 993
    auth: {
      user: env.mailUser,
      pass: env.mailPassword,
    },
    logger: false, // suppress imapflow's protocol logging (would echo credentials)
  });

  console.log(`Connecting to ${env.imapHost}:${env.imapPort} as ${env.mailUser} ...`);
  await client.connect();
  console.log("Connected. Fetching folder list:\n");

  try {
    const folders = await client.list();
    for (const folder of folders) {
      const flags = folder.flags?.size ? ` [${[...folder.flags].join(", ")}]` : "";
      console.log(`  ${folder.path}${flags}`);
    }
    console.log(`\nDone — ${folders.length} folder(s). Credentials work. ✅`);
  } finally {
    await client.logout();
  }
}

main().catch((err: unknown) => {
  // Redact: print only the message, never the full client config (which holds the password).
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nIMAP check failed: ${message}`);
  process.exit(1);
});
