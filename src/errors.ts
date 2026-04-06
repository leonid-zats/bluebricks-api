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
