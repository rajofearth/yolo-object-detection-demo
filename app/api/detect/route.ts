import type { NextRequest } from "next/server";
import { BadRequestError } from "./_lib/errors";
import { getInputName, getOutputName, getSession } from "./_lib/model";
import { postprocess } from "./_lib/postprocess";
import { preprocess } from "./_lib/preprocess";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "./_lib/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();

  try {
    // Validate Content-Type
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Content-Type must be multipart/form-data",
      );
    }

    // Parse form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse form data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }

    // Validate frame file
    const file = formData.get("frame");
    if (!file || !(file instanceof Blob)) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Missing or invalid 'frame' field",
      );
    }

    if (file.size === 0) {
      return createErrorResponse(requestId, "BAD_REQUEST", "Empty frame file");
    }

    // Convert to buffer
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read frame data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }

    // Preprocess image
    const { tensor, letterbox } = await preprocess(buffer);

    // Get model session and run inference
    const session = await getSession();
    const inputName = getInputName(session);
    const results = await session.run({ [inputName]: tensor });

    // Get output
    const outputName = getOutputName(session);
    const output = results[outputName];
    if (!output) {
      return createErrorResponse(
        requestId,
        "INFERENCE_ERROR",
        `No output found with name '${outputName}'`,
        { availableOutputs: session.outputNames },
      );
    }

    // Postprocess detections
    const detections = postprocess(output, letterbox);

    const latencyMs = performance.now() - startTime;

    return createSuccessResponse(
      requestId,
      detections,
      { width: letterbox.origWidth, height: letterbox.origHeight },
      { latencyMs },
    );
  } catch (error) {
    const latencyMs = performance.now() - startTime;

    if (error instanceof BadRequestError) {
      return createErrorResponse(
        requestId,
        error.errorCode,
        error.message,
        error.details,
      );
    }

    // Check if it's one of our custom errors
    if (
      error &&
      typeof error === "object" &&
      "errorCode" in error &&
      typeof error.errorCode === "string"
    ) {
      const detectError = error as {
        errorCode: string;
        message?: string;
        details?: unknown;
      };
      return createErrorResponse(
        requestId,
        detectError.errorCode as BadRequestError["errorCode"],
        detectError.message ?? "Unknown error",
        detectError.details as BadRequestError["details"],
      );
    }

    // Log unexpected errors with requestId for debugging
    console.error(
      `[YOLO] [${requestId}] Unexpected error (${latencyMs.toFixed(0)}ms):`,
      error,
    );

    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      { latencyMs },
    );
  }
}
