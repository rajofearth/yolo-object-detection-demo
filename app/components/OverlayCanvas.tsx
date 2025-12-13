"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import type Webcam from "react-webcam";
import { drawDetections, syncCanvasSize } from "@/app/lib/draw";
import type { Detection } from "@/app/lib/types";

export interface OverlayCanvasProps {
  readonly webcamRef: React.RefObject<Webcam | null>;
  readonly detections: readonly Detection[];
  readonly frameDimensions: {
    readonly width: number;
    readonly height: number;
  } | null;
}

export function OverlayCanvas({
  webcamRef,
  detections,
  frameDimensions,
}: OverlayCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const syncSize = () => {
      syncCanvasSize(canvas, video);
    };

    syncSize();
    video.addEventListener("loadedmetadata", syncSize);
    video.addEventListener("resize", syncSize);

    return () => {
      video.removeEventListener("loadedmetadata", syncSize);
      video.removeEventListener("resize", syncSize);
    };
  }, [webcamRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!frameDimensions) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    drawDetections(ctx, detections, {
      frameW: frameDimensions.width,
      frameH: frameDimensions.height,
    });
  }, [detections, frameDimensions]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
      }}
    />
  );
}
