import type { DetectErrorCode } from "@/app/lib/types";

export class DetectError extends Error {
  constructor(
    public readonly errorCode: DetectErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DetectError";
  }
}

export class BadRequestError extends DetectError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("BAD_REQUEST", message, details);
    this.name = "BadRequestError";
  }
}

export class UnsupportedMediaError extends DetectError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("UNSUPPORTED_MEDIA", message, details);
    this.name = "UnsupportedMediaError";
  }
}

export class ModelError extends DetectError {
  constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
    cause?: unknown,
  ) {
    super("MODEL_ERROR", message, details, cause);
    this.name = "ModelError";
  }
}

export class InferenceError extends DetectError {
  constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
    cause?: unknown,
  ) {
    super("INFERENCE_ERROR", message, details, cause);
    this.name = "InferenceError";
  }
}

export class InternalError extends DetectError {
  constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
    cause?: unknown,
  ) {
    super("INTERNAL_ERROR", message, details, cause);
    this.name = "InternalError";
  }
}

export function toHttpStatus(errorCode: DetectErrorCode): number {
  switch (errorCode) {
    case "BAD_REQUEST":
      return 400;
    case "UNSUPPORTED_MEDIA":
      return 415;
    case "MODEL_ERROR":
    case "INFERENCE_ERROR":
      return 500;
    case "INTERNAL_ERROR":
      return 500;
    default:
      return 500;
  }
}
