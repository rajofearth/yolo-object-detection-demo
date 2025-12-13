import type { NextRequest } from "next/server";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { join } from "path";

export const runtime = "nodejs";

let session: ort.InferenceSession | null = null;
let sessionInitialized = false;
let outputShapeLogged = false;

interface LetterboxInfo {
  ratio: number;
  padX: number;
  padY: number;
  origWidth: number;
  origHeight: number;
}

async function getSession() {
  if (!session) {
    const modelPath = join(process.cwd(), "public", "models", "yolo11n.onnx");
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    });

    // Log model info once on first load
    if (!sessionInitialized) {
      console.log("[YOLO] Model loaded:", modelPath);
      console.log("[YOLO] Input names:", session.inputNames);
      console.log("[YOLO] Output names:", session.outputNames);
      sessionInitialized = true;
    }
  }
  return session;
}

async function preprocess(
  imageBuffer: Buffer,
): Promise<{ tensor: ort.Tensor; letterbox: LetterboxInfo }> {
  const metadata = await sharp(imageBuffer).metadata();
  const origWidth = metadata.width ?? 640;
  const origHeight = metadata.height ?? 480;

  // Letterbox preprocessing: maintain aspect ratio with padding
  const modelSize = 640;
  const ratio = Math.min(modelSize / origWidth, modelSize / origHeight);
  const newWidth = Math.round(origWidth * ratio);
  const newHeight = Math.round(origHeight * ratio);
  const padLeft = Math.floor((modelSize - newWidth) / 2);
  const padTop = Math.floor((modelSize - newHeight) / 2);
  const padRight = modelSize - newWidth - padLeft;
  const padBottom = modelSize - newHeight - padTop;

  // Resize with letterbox (contain fit with gray padding)
  const resized = await sharp(imageBuffer)
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

  // Convert RGBA to RGB and normalize to [0, 1] range
  // YOLO expects CHW format: [batch, channels, height, width]
  const floatData = new Float32Array(3 * modelSize * modelSize);
  for (let i = 0; i < resized.length; i += 4) {
    const pixelIndex = i / 4;
    // RGB channels normalized to [0, 1]
    floatData[pixelIndex] = resized[i] / 255; // R
    floatData[pixelIndex + modelSize * modelSize] = resized[i + 1] / 255; // G
    floatData[pixelIndex + 2 * modelSize * modelSize] = resized[i + 2] / 255; // B
    // Skip alpha channel (resized[i + 3])
  }

  const tensor = new ort.Tensor("float32", floatData, [1, 3, modelSize, modelSize]);

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

interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  class: number;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function iou(box1: Detection, box2: Detection): number {
  const x1 = Math.max(box1.x1, box2.x1);
  const y1 = Math.max(box1.y1, box2.y1);
  const x2 = Math.min(box1.x2, box2.x2);
  const y2 = Math.min(box1.y2, box2.y2);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
  const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
  const union = area1 + area2 - intersection;

  return intersection / union;
}

function nms(detections: Detection[], iouThreshold: number): Detection[] {
  // Sort by confidence descending
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];

  while (sorted.length > 0) {
    const current = sorted.shift();
    if (!current) break;
    kept.push(current);

    // Remove boxes with high IoU
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return kept;
}

function postprocess(
  output: ort.Tensor,
  letterbox: LetterboxInfo,
): Detection[] {
  const data = output.data as Float32Array;
  const shape = output.dims;

  // Log output shape once for debugging
  if (!outputShapeLogged) {
    console.log("[YOLO] Output shape:", shape);
    outputShapeLogged = true;
  }

  const numClasses = 80; // COCO dataset
  const stride = 4 + numClasses; // 84 total
  let numDetections: number;
  let isTransposed = false;

  // YOLO11 ONNX typically outputs (1, 84, 8400) - channel-major format
  // We need to transpose to (8400, 84) for row-major access
  if (shape.length === 3 && shape[0] === 1) {
    // Shape: [batch=1, channels=84, detections=8400]
    if (shape[1] === 84 && shape[2] === 8400) {
      numDetections = 8400;
      isTransposed = true;
    } else if (shape[1] === 8400 && shape[2] === 84) {
      // Already in row-major format [1, 8400, 84]
      numDetections = 8400;
    } else {
      numDetections = Math.floor(data.length / stride);
    }
  } else if (shape.length === 2) {
    // [num_detections, 84] or [84, num_detections]
    if (shape[0] === 84) {
      numDetections = shape[1] ?? 8400;
      isTransposed = true;
    } else {
      numDetections = shape[0] ?? 8400;
    }
  } else {
    // Fallback: infer from data length
    numDetections = Math.floor(data.length / stride);
  }

  const detections: Detection[] = [];
  const confidenceThreshold = 0.35;

  // Transpose data if needed for row-major access
  let accessData: Float32Array;
  if (isTransposed) {
    // Transpose: data[c * numDetections + i] -> accessData[i * stride + c]
    accessData = new Float32Array(numDetections * stride);
    for (let i = 0; i < numDetections; i++) {
      for (let c = 0; c < stride; c++) {
        accessData[i * stride + c] = data[c * numDetections + i];
      }
    }
  } else {
    accessData = data;
  }

  for (let i = 0; i < numDetections; i++) {
    const offset = i * stride;
    if (offset + stride > accessData.length) break;

    // YOLO format: [x_center, y_center, width, height] in model input space (0-640)
    const xCenter = accessData[offset];
    const yCenter = accessData[offset + 1];
    const width = accessData[offset + 2];
    const height = accessData[offset + 3];

    // Find max confidence class
    let maxRawScore = -Infinity;
    let maxClass = 0;
    for (let j = 0; j < numClasses; j++) {
      const raw = accessData[offset + 4 + j] ?? 0;
      if (raw > maxRawScore) {
        maxRawScore = raw;
        maxClass = j;
      }
    }

    // Some exports already output probabilities (0..1). Others output logits.
    const maxConfidence =
      maxRawScore < 0 || maxRawScore > 1 ? sigmoid(maxRawScore) : maxRawScore;

    if (maxConfidence > confidenceThreshold) {
      // Some exports output normalized (0..1) box coords; others output pixels (0..640).
      const looksNormalized =
        Math.abs(width) <= 2 && Math.abs(height) <= 2 && xCenter <= 2 && yCenter <= 2;
      const xCenterPx = looksNormalized ? xCenter * 640 : xCenter;
      const yCenterPx = looksNormalized ? yCenter * 640 : yCenter;
      const widthPx = looksNormalized ? width * 640 : width;
      const heightPx = looksNormalized ? height * 640 : height;

      // Convert center format to corner format in model space
      const x1Model = xCenterPx - widthPx / 2;
      const y1Model = yCenterPx - heightPx / 2;
      const x2Model = xCenterPx + widthPx / 2;
      const y2Model = yCenterPx + heightPx / 2;

      // Unletterbox: convert from model space to original image space
      const x1 = Math.max(0, Math.min(letterbox.origWidth, (x1Model - letterbox.padX) / letterbox.ratio));
      const y1 = Math.max(0, Math.min(letterbox.origHeight, (y1Model - letterbox.padY) / letterbox.ratio));
      const x2 = Math.max(0, Math.min(letterbox.origWidth, (x2Model - letterbox.padX) / letterbox.ratio));
      const y2 = Math.max(0, Math.min(letterbox.origHeight, (y2Model - letterbox.padY) / letterbox.ratio));

      detections.push({
        x1,
        y1,
        x2,
        y2,
        confidence: maxConfidence,
        class: maxClass,
      });
    }
  }

  // Apply NMS
  return nms(detections, 0.45).slice(0, 100);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("frame") as Blob;
    if (!file) {
      return Response.json({ error: "No frame provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { tensor, letterbox } = await preprocess(buffer);
    const sess = await getSession();

    // Get input name dynamically (usually "images" or "input")
    const inputName = sess.inputNames[0] ?? "images";
    const results = await sess.run({ [inputName]: tensor });

    // Get output (usually "output0" or first output)
    const outputName = sess.outputNames[0] ?? "output0";
    const output = results[outputName] as ort.Tensor;

    if (!output) {
      return Response.json(
        { error: "No output from model", outputNames: sess.outputNames },
        { status: 500 },
      );
    }

    const detections = postprocess(output, letterbox);

    return Response.json({
      detections,
      frame: { width: letterbox.origWidth, height: letterbox.origHeight },
    });
  } catch (error) {
    console.error("[YOLO] Detection error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
