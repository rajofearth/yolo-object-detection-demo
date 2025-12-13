import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { BadRequestError, UnsupportedMediaError } from "./errors";

export interface LetterboxInfo {
  readonly ratio: number;
  readonly padX: number;
  readonly padY: number;
  readonly origWidth: number;
  readonly origHeight: number;
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MODEL_SIZE = 640;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function preprocess(
  imageBuffer: Buffer,
): Promise<{ tensor: ort.Tensor; letterbox: LetterboxInfo }> {
  if (imageBuffer.length === 0) {
    throw new BadRequestError("Empty image buffer");
  }

  if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new BadRequestError(
      `Image too large: ${imageBuffer.length} bytes (max: ${MAX_IMAGE_SIZE_BYTES})`,
    );
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new UnsupportedMediaError(
      `Failed to parse image: ${message}`,
      undefined,
    );
  }

  if (
    !metadata.format ||
    !ALLOWED_MIME_TYPES.some((mime) => mime.includes(metadata.format ?? ""))
  ) {
    throw new UnsupportedMediaError(
      `Unsupported image format: ${metadata.format ?? "unknown"}`,
    );
  }

  const origWidth = metadata.width ?? 640;
  const origHeight = metadata.height ?? 480;

  if (
    origWidth <= 0 ||
    origHeight <= 0 ||
    !Number.isFinite(origWidth) ||
    !Number.isFinite(origHeight)
  ) {
    throw new BadRequestError(
      `Invalid image dimensions: ${origWidth}x${origHeight}`,
    );
  }

  // Letterbox preprocessing: maintain aspect ratio with padding
  const ratio = Math.min(MODEL_SIZE / origWidth, MODEL_SIZE / origHeight);
  const newWidth = Math.round(origWidth * ratio);
  const newHeight = Math.round(origHeight * ratio);
  const padLeft = Math.floor((MODEL_SIZE - newWidth) / 2);
  const padTop = Math.floor((MODEL_SIZE - newHeight) / 2);
  const padRight = MODEL_SIZE - newWidth - padLeft;
  const padBottom = MODEL_SIZE - newHeight - padTop;

  let resized: Buffer;
  try {
    resized = await sharp(imageBuffer)
      .resize(newWidth, newHeight, { fit: "contain" })
      .extend({
        top: padTop,
        bottom: padBottom,
        left: padLeft,
        right: padRight,
        background: { r: 114, g: 114, b: 114 }, // YOLO-style gray padding
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new UnsupportedMediaError(
      `Failed to preprocess image: ${message}`,
      undefined,
    );
  }

  // Convert RGBA to RGB and normalize to [0, 1] range
  // YOLO expects CHW format: [batch, channels, height, width]
  const floatData = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
  for (let i = 0; i < resized.length; i += 4) {
    const pixelIndex = i / 4;
    if (pixelIndex >= MODEL_SIZE * MODEL_SIZE) break;
    const r = resized[i];
    const g = resized[i + 1];
    const b = resized[i + 2];
    if (r !== undefined && g !== undefined && b !== undefined) {
      // RGB channels normalized to [0, 1]
      floatData[pixelIndex] = r / 255; // R
      floatData[pixelIndex + MODEL_SIZE * MODEL_SIZE] = g / 255; // G
      floatData[pixelIndex + 2 * MODEL_SIZE * MODEL_SIZE] = b / 255; // B
    }
    // Skip alpha channel (resized[i + 3])
  }

  const tensor = new ort.Tensor("float32", floatData, [
    1,
    3,
    MODEL_SIZE,
    MODEL_SIZE,
  ]);

  return {
    tensor,
    letterbox: {
      ratio,
      padX: padLeft,
      padY: padTop,
      origWidth,
      origHeight,
    },
  };
}
