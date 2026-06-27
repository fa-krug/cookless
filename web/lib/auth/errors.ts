/** Mirrors Django Ninja's HttpError: an error that carries an HTTP status code. */
export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
