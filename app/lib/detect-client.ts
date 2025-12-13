import type { DetectOk, DetectResponse } from "./types";
import { parseDetectResponse } from "./types";

export interface FetchDetectOptions {
  readonly signal?: AbortSignal;
}

export interface FetchDetectResult {
  readonly success: true;
  readonly data: DetectOk;
}

export interface FetchDetectError {
  readonly success: false;
  readonly error: string;
  readonly errorCode?: Extract<DetectResponse, { ok: false }>["errorCode"];
}

export type FetchDetectResultType = FetchDetectResult | FetchDetectError;

export async function fetchDetect(
  imageBlob: Blob,
  options?: FetchDetectOptions,
): Promise<FetchDetectResultType> {
  try {
    const formData = new FormData();
    formData.append("frame", imageBlob);

    const response = await fetch("/api/detect", {
      method: "POST",
      body: formData,
      signal: options?.signal,
    });

    if (!response.ok && response.status >= 500) {
      return {
        success: false,
        error: `Server error: ${response.status} ${response.statusText}`,
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse response";
      return {
        success: false,
        error: `Invalid response: ${message}`,
      };
    }

    const parsed = parseDetectResponse(json);

    if (!parsed.ok) {
      const errorResponse = parsed as Extract<DetectResponse, { ok: false }>;
      return {
        success: false,
        error: errorResponse.message,
        errorCode: errorResponse.errorCode,
      };
    }

    return {
      success: true,
      data: parsed,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: "Request cancelled",
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Network error: ${message}`,
    };
  }
}
