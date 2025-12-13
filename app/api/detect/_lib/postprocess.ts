import type * as ort from "onnxruntime-node";
import type { Detection } from "@/app/lib/types";
import { InferenceError } from "./errors";
import type { LetterboxInfo } from "./preprocess";

const MODEL_SIZE = 640;
const NUM_CLASSES = 80; // COCO dataset
const STRIDE = 4 + NUM_CLASSES; // 84 total
const CONFIDENCE_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 100;

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

  if (union === 0) return 0;
  return intersection / union;
}

function nms(detections: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];

  while (sorted.length > 0) {
    const current = sorted.shift();
    if (!current) break;
    kept.push(current);

    for (let i = sorted.length - 1; i >= 0; i--) {
      const candidate = sorted[i];
      if (candidate && iou(current, candidate) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return kept;
}

function transposeData(
  data: Float32Array,
  numDetections: number,
  stride: number,
): Float32Array {
  const accessData = new Float32Array(numDetections * stride);
  for (let i = 0; i < numDetections; i++) {
    for (let c = 0; c < stride; c++) {
      accessData[i * stride + c] = data[c * numDetections + i] ?? 0;
    }
  }
  return accessData;
}

export function postprocess(
  output: ort.Tensor,
  letterbox: LetterboxInfo,
): Detection[] {
  const data = output.data as Float32Array;
  const shape = output.dims;

  if (!Array.isArray(shape) || shape.length === 0) {
    throw new InferenceError("Invalid output tensor shape");
  }

  let numDetections: number;
  let isTransposed = false;

  // YOLO11 ONNX typically outputs (1, 84, 8400) - channel-major format
  if (shape.length === 3 && shape[0] === 1) {
    if (shape[1] === 84 && shape[2] === 8400) {
      numDetections = 8400;
      isTransposed = true;
    } else if (shape[1] === 8400 && shape[2] === 84) {
      numDetections = 8400;
    } else {
      numDetections = Math.floor(data.length / STRIDE);
    }
  } else if (shape.length === 2) {
    if (shape[0] === 84) {
      numDetections = shape[1] ?? 8400;
      isTransposed = true;
    } else {
      numDetections = shape[0] ?? 8400;
    }
  } else {
    numDetections = Math.floor(data.length / STRIDE);
  }

  if (numDetections <= 0 || !Number.isFinite(numDetections)) {
    throw new InferenceError(`Invalid number of detections: ${numDetections}`);
  }

  const detections: Detection[] = [];

  // Transpose data if needed for row-major access
  const accessData = isTransposed
    ? transposeData(data, numDetections, STRIDE)
    : data;

  for (let i = 0; i < numDetections; i++) {
    const offset = i * STRIDE;
    if (offset + STRIDE > accessData.length) break;

    const xCenter = accessData[offset] ?? 0;
    const yCenter = accessData[offset + 1] ?? 0;
    const width = accessData[offset + 2] ?? 0;
    const height = accessData[offset + 3] ?? 0;

    // Find max confidence class
    let maxRawScore = -Infinity;
    let maxClass = 0;
    for (let j = 0; j < NUM_CLASSES; j++) {
      const raw = accessData[offset + 4 + j] ?? 0;
      if (raw > maxRawScore) {
        maxRawScore = raw;
        maxClass = j;
      }
    }

    // Some exports already output probabilities (0..1). Others output logits.
    const maxConfidence =
      maxRawScore < 0 || maxRawScore > 1 ? sigmoid(maxRawScore) : maxRawScore;

    if (maxConfidence > CONFIDENCE_THRESHOLD) {
      // Some exports output normalized (0..1) box coords; others output pixels (0..640).
      const looksNormalized =
        Math.abs(width) <= 2 &&
        Math.abs(height) <= 2 &&
        xCenter <= 2 &&
        yCenter <= 2;
      const xCenterPx = looksNormalized ? xCenter * MODEL_SIZE : xCenter;
      const yCenterPx = looksNormalized ? yCenter * MODEL_SIZE : yCenter;
      const widthPx = looksNormalized ? width * MODEL_SIZE : width;
      const heightPx = looksNormalized ? height * MODEL_SIZE : height;

      // Convert center format to corner format in model space
      const x1Model = xCenterPx - widthPx / 2;
      const y1Model = yCenterPx - heightPx / 2;
      const x2Model = xCenterPx + widthPx / 2;
      const y2Model = yCenterPx + heightPx / 2;

      // Unletterbox: convert from model space to original image space
      const x1 = Math.max(
        0,
        Math.min(
          letterbox.origWidth,
          (x1Model - letterbox.padX) / letterbox.ratio,
        ),
      );
      const y1 = Math.max(
        0,
        Math.min(
          letterbox.origHeight,
          (y1Model - letterbox.padY) / letterbox.ratio,
        ),
      );
      const x2 = Math.max(
        0,
        Math.min(
          letterbox.origWidth,
          (x2Model - letterbox.padX) / letterbox.ratio,
        ),
      );
      const y2 = Math.max(
        0,
        Math.min(
          letterbox.origHeight,
          (y2Model - letterbox.padY) / letterbox.ratio,
        ),
      );

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
  return nms(detections, IOU_THRESHOLD).slice(0, MAX_DETECTIONS);
}
