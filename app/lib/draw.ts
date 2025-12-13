import { cocoClassName } from "./coco";
import type { Detection } from "./types";

export interface DrawDetectionsOptions {
  readonly frameW: number;
  readonly frameH: number;
}

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: readonly Detection[],
  options: DrawDetectionsOptions,
): void {
  const { frameW, frameH } = options;
  const sx = ctx.canvas.width / frameW;
  const sy = ctx.canvas.height / frameH;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (detections.length === 0) {
    return;
  }

  for (const det of detections) {
    const x1 = det.x1 * sx;
    const y1 = det.y1 * sy;
    const x2 = det.x2 * sx;
    const y2 = det.y2 * sy;
    const width = x2 - x1;
    const height = y2 - y1;

    // Draw box
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, width, height);

    // Draw label background
    ctx.fillStyle = "#00ff00";
    ctx.font = "16px Arial";
    const label = `${cocoClassName(det.class)} ${(det.confidence * 100).toFixed(1)}%`;
    const textMetrics = ctx.measureText(label);
    const labelHeight = 20;
    ctx.fillRect(x1, y1 - labelHeight, textMetrics.width + 4, labelHeight);

    // Draw label text
    ctx.fillStyle = "#000000";
    ctx.fillText(label, x1 + 2, y1 - 4);
  }
}

export function syncCanvasSize(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}
