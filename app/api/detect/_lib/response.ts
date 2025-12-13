import { randomUUID } from "node:crypto";
import type { DetectErr, DetectErrorCode, DetectOk } from "@/app/lib/types";
import { toHttpStatus } from "./errors";

export function generateRequestId(): string {
  return randomUUID();
}

export function createSuccessResponse(
  requestId: string,
  detections: DetectOk["detections"],
  frame: DetectOk["frame"],
  meta?: DetectOk["meta"],
): Response {
  const body: DetectOk = {
    ok: true,
    requestId,
    detections,
    frame,
    meta,
  };
  return Response.json(body, { status: 200 });
}

export function createErrorResponse(
  requestId: string,
  errorCode: DetectErrorCode,
  message: string,
  details?: DetectErr["details"],
): Response {
  const status = toHttpStatus(errorCode);
  const body: DetectErr = {
    ok: false,
    requestId,
    errorCode,
    message,
    details,
  };
  return Response.json(body, { status });
}
