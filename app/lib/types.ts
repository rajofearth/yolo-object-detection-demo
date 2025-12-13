export interface Detection {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly confidence: number;
  readonly class: number;
}

export interface FrameDimensions {
  readonly width: number;
  readonly height: number;
}

export type DetectErrorCode =
  | "BAD_REQUEST"
  | "UNSUPPORTED_MEDIA"
  | "MODEL_ERROR"
  | "INFERENCE_ERROR"
  | "INTERNAL_ERROR";

export interface DetectOk {
  readonly ok: true;
  readonly requestId: string;
  readonly detections: readonly Detection[];
  readonly frame: FrameDimensions;
  readonly meta?: {
    readonly latencyMs?: number;
  };
}

export interface DetectErr {
  readonly ok: false;
  readonly requestId: string;
  readonly errorCode: DetectErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type DetectResponse = DetectOk | DetectErr;

function isDetection(value: unknown): value is Detection {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.x1 === "number" &&
    typeof d.y1 === "number" &&
    typeof d.x2 === "number" &&
    typeof d.y2 === "number" &&
    typeof d.confidence === "number" &&
    typeof d.class === "number" &&
    d.confidence >= 0 &&
    d.confidence <= 1 &&
    d.class >= 0 &&
    Number.isInteger(d.class)
  );
}

function isFrameDimensions(value: unknown): value is FrameDimensions {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.width === "number" &&
    typeof f.height === "number" &&
    f.width > 0 &&
    f.height > 0 &&
    Number.isFinite(f.width) &&
    Number.isFinite(f.height)
  );
}

function isDetectErrorCode(value: unknown): value is DetectErrorCode {
  return (
    typeof value === "string" &&
    (value === "BAD_REQUEST" ||
      value === "UNSUPPORTED_MEDIA" ||
      value === "MODEL_ERROR" ||
      value === "INFERENCE_ERROR" ||
      value === "INTERNAL_ERROR")
  );
}

export function parseDetectResponse(json: unknown): DetectResponse {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid response: not an object");
  }

  const obj = json as Record<string, unknown>;

  if (typeof obj.ok !== "boolean") {
    throw new Error("Invalid response: missing 'ok' field");
  }

  if (typeof obj.requestId !== "string" || obj.requestId.length === 0) {
    throw new Error("Invalid response: missing or invalid 'requestId'");
  }

  if (obj.ok === true) {
    if (!Array.isArray(obj.detections)) {
      throw new Error("Invalid response: 'detections' must be an array");
    }

    if (!obj.detections.every(isDetection)) {
      throw new Error("Invalid response: invalid detection format");
    }

    if (!isFrameDimensions(obj.frame)) {
      throw new Error("Invalid response: invalid frame dimensions");
    }

    return {
      ok: true,
      requestId: obj.requestId,
      detections: obj.detections,
      frame: obj.frame,
      meta:
        obj.meta && typeof obj.meta === "object"
          ? (obj.meta as DetectOk["meta"])
          : undefined,
    };
  }

  if (!isDetectErrorCode(obj.errorCode)) {
    throw new Error("Invalid response: missing or invalid 'errorCode'");
  }

  if (typeof obj.message !== "string") {
    throw new Error("Invalid response: missing or invalid 'message'");
  }

  return {
    ok: false,
    requestId: obj.requestId,
    errorCode: obj.errorCode,
    message: obj.message,
    details:
      obj.details && typeof obj.details === "object"
        ? (obj.details as DetectErr["details"])
        : undefined,
  };
}
