export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export function handleError(error: unknown): { message: string; code: string; statusCode: number } {
  if (error instanceof AppError) {
    return { message: error.message, code: error.code, statusCode: error.statusCode };
  }

  if (error instanceof Error) {
    console.error("Unhandled error:", error);
    return { message: "An unexpected error occurred", code: "INTERNAL_ERROR", statusCode: 500 };
  }

  return { message: "An unknown error occurred", code: "UNKNOWN_ERROR", statusCode: 500 };
}

export function logError(error: unknown, context?: string): void {
  const prefix = context ? `[${context}]` : "[Error]";
  if (error instanceof Error) {
    console.error(prefix, error.message, error.stack);
  } else {
    console.error(prefix, error);
  }
}
