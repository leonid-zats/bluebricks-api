/** True when `express.json` / body-parser failed to parse the request body as JSON. */
export function isMalformedJsonBodyError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const e = err as { status?: number; statusCode?: number; type?: string };
  const status = e.status ?? e.statusCode;
  return status === 400 && e.type === "entity.parse.failed";
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }

  toBody(): { error: string; message: string } {
    return { error: this.code, message: this.message };
  }
}
