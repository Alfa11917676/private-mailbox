import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import csrf from "@fastify/csrf-protection";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { HttpError } from "./errors.js";
import { imap } from "./imap.js";
import { authRoutes } from "./routes/auth.js";
import { mailRoutes } from "./routes/mail.js";

// No credentials or message contents are ever logged. Body limit is raised to
// accommodate base64-encoded attachments on /api/send (15 MB decoded ≈ 20 MB).
const app = Fastify({
  logger: { level: "info" },
  bodyLimit: 30 * 1024 * 1024,
});

// --- Plugins ------------------------------------------------------------
await app.register(cookie, { secret: env.sessionSecret });
await app.register(rateLimit, { global: false });
await app.register(csrf, {
  cookieOpts: {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
  },
  getToken: (req) => {
    const header = req.headers["x-csrf-token"];
    return Array.isArray(header) ? header[0] : header;
  },
});

// --- Error handling -----------------------------------------------------
// Surface a stable { error: { code, message } } shape and never leak stack
// traces or internals to the client (security rule #5).
app.setErrorHandler((error, request, reply) => {
  if (error instanceof HttpError) {
    return reply
      .status(error.statusCode)
      .send({ error: { code: error.code, message: error.message } });
  }
  const err = error as FastifyError;
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 400 && statusCode < 500) {
    const code = err.code ?? "bad_request";
    return reply
      .status(statusCode)
      .send({ error: { code, message: err.message } });
  }
  request.log.error(err);
  return reply
    .status(500)
    .send({ error: { code: "internal", message: "Internal server error" } });
});

// --- Routes -------------------------------------------------------------
app.get("/api/health", async () => ({
  status: "ok",
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

await app.register(authRoutes);
await app.register(mailRoutes);

// --- Lifecycle ----------------------------------------------------------
async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await imap.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.port, host: "127.0.0.1" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
