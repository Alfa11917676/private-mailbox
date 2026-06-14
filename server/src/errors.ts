/** Error carrying an HTTP status + stable code, surfaced as { error: { code, message } }. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string) => new HttpError(400, "bad_request", msg);
export const unauthorized = (msg = "Not authenticated") =>
  new HttpError(401, "unauthorized", msg);
export const notFound = (msg = "Not found") => new HttpError(404, "not_found", msg);
export const upstream = (msg: string) => new HttpError(502, "imap_error", msg);
