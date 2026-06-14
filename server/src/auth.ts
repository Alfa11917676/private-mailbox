import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";
import { unauthorized } from "./errors.js";

const SESSION_COOKIE = "mb_session";
const SESSION_VALUE = "ok";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const cookieOptions = {
  signed: true,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.isProd, // Secure in production (HTTPS); relaxed for localhost dev
  path: "/",
};

/** Constant-time passphrase comparison (hash first so lengths never leak). */
export function passphraseMatches(candidate: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(env.appPassphrase).digest();
  return timingSafeEqual(a, b);
}

export function setSession(reply: FastifyReply): void {
  reply.setCookie(SESSION_COOKIE, SESSION_VALUE, {
    ...cookieOptions,
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function isAuthenticated(request: FastifyRequest): boolean {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return false;
  const result = request.unsignCookie(raw);
  return result.valid && result.value === SESSION_VALUE;
}

/** preHandler that rejects unauthenticated requests. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!isAuthenticated(request)) throw unauthorized();
}
