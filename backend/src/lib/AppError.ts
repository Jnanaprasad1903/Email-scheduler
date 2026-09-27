/**
 * Typed HTTP error that flows through the central error handler.
 * Throw this anywhere in a route or service to return a clean JSON error.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
