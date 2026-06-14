import type { FastifyInstance } from "fastify";
import {
  clearSession,
  isAuthenticated,
  passphraseMatches,
  requireAuth,
  setSession,
} from "../auth.js";
import { badRequest, unauthorized } from "../errors.js";
import { env } from "../env.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login — rate-limited to blunt brute-force against the passphrase.
  app.post(
    "/api/login",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = request.body as { passphrase?: unknown } | undefined;
      const passphrase = body?.passphrase;
      if (typeof passphrase !== "string" || passphrase.length === 0) {
        throw badRequest("Passphrase is required");
      }
      if (!passphraseMatches(passphrase)) {
        throw unauthorized("Invalid passphrase");
      }
      setSession(reply);
      return { ok: true };
    },
  );

  app.post("/api/logout", async (_request, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get("/api/session", async (request) => {
    const authenticated = isAuthenticated(request);
    // Expose the account address (only when authed) so the client can build
    // reply-all recipient lists and drop the account's own address.
    return authenticated
      ? { authenticated, address: env.mailUser }
      : { authenticated };
  });

  // CSRF token for state-changing requests (double-submit cookie pattern).
  app.get(
    "/api/csrf-token",
    { preHandler: requireAuth },
    async (_request, reply) => {
      return { token: reply.generateCsrf() };
    },
  );
}
