import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load server/.env regardless of the current working directory, so this works
// identically whether started via `pnpm dev` (cwd = server/) or the standalone
// imap-check script. This module lives in server/src/, so .env is one level up.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, "../.env") });

/** Required env keys — startup fails fast (and loudly) if any are missing. */
const REQUIRED = [
  "APP_PASSPHRASE",
  "SESSION_SECRET",
  "MAIL_USER",
  "MAIL_PASSWORD",
  "IMAP_HOST",
  "IMAP_PORT",
  "SMTP_HOST",
  "SMTP_PORT",
] as const;

function read(key: (typeof REQUIRED)[number]): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required env var: ${key}. Copy server/.env.example to server/.env and fill it in.`,
    );
  }
  return value;
}

function readPort(key: (typeof REQUIRED)[number]): number {
  const raw = read(key);
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Env var ${key} must be a valid port number, got: ${raw}`);
  }
  return port;
}

const missing = REQUIRED.filter(
  (key) => process.env[key] === undefined || process.env[key] === "",
);
if (missing.length > 0) {
  // Never print values — only the names of the missing keys.
  throw new Error(
    `Missing required env vars: ${missing.join(", ")}. ` +
      `Copy server/.env.example to server/.env and fill it in.`,
  );
}

const nodeEnv = process.env.NODE_ENV ?? "development";

/** Typed, validated environment. Secret values are never logged. */
export const env = {
  appPassphrase: read("APP_PASSPHRASE"),
  sessionSecret: read("SESSION_SECRET"),
  mailUser: read("MAIL_USER"),
  mailPassword: read("MAIL_PASSWORD"),
  imapHost: read("IMAP_HOST"),
  imapPort: readPort("IMAP_PORT"),
  smtpHost: read("SMTP_HOST"),
  smtpPort: readPort("SMTP_PORT"),
  port: Number(process.env.PORT) || 3001,
  nodeEnv,
  isProd: nodeEnv === "production",
} as const;
