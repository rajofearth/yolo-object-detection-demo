"use client";
import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";

interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  class: number;
}

interface DetectResponse {
  detections: Detection[];
  frame?: { width: number; height: number };
}

export default function Home() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inFlightRef = useRef(false);

  const updateCanvasSize = () => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    if (video && canvas && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      if (webcamRef.current && canvasRef.current && !inFlightRef.current) {
        const imageSrc = webcamRef.current.getScreenshot(); // base64 JPEG
        if (imageSrc) {
          inFlightRef.current = true;
          setIsProcessing(true);
          const startTime = performance.now();

          try {
            const blob = await fetch(imageSrc).then((r) => r.blob());
            const form = new FormData();
            form.append("frame", blob);

            const res = await fetch("/api/detect", {
              method: "POST",
              body: form,
            });

            const json = (await res.json()) as DetectResponse;
            const detections = json.detections ?? [];
            const frameW = json.frame?.width ?? webcamRef.current.video?.videoWidth ?? 640;
            const frameH =
              json.frame?.height ?? webcamRef.current.video?.videoHeight ?? 480;

            const latency = performance.now() - startTime;
            setLastLatency(latency);
            setDetectionCount(detections?.length ?? 0);

            // Draw on canvas overlay
            const ctx = canvasRef.current.getContext("2d");
            const video = webcamRef.current.video;
            if (ctx && video) {
              // Ensure canvas matches video dimensions
              if (
                canvasRef.current.width !== video.videoWidth ||
                canvasRef.current.height !== video.videoHeight
              ) {
                canvasRef.current.width = video.videoWidth;
                canvasRef.current.height = video.videoHeight;
              }

              ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

              // Draw detection boxes
              if (detections && detections.length > 0) {
                const sx = ctx.canvas.width / frameW;
                const sy = ctx.canvas.height / frameH;

                detections.forEach((det) => {
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
                  const label = `Class ${det.class} ${(det.confidence * 100).toFixed(1)}%`;
                  const textMetrics = ctx.measureText(label);
                  const labelHeight = 20;
                  ctx.fillRect(x1, y1 - labelHeight, textMetrics.width + 4, labelHeight);

                  // Draw label text
                  ctx.fillStyle = "#000000";
                  ctx.fillText(label, x1 + 2, y1 - 4);
                });
              }
            }
          } catch (error) {
            console.error("Detection error:", error);
          } finally {
            setIsProcessing(false);
            inFlightRef.current = false;
          }
        }
      }
    }, 200); // ~5 FPS - more sustainable for server

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Webcam
        ref={webcamRef}
        width={640}
        height={480}
        videoConstraints={{
          width: 640,
          height: 480,
        }}
        onUserMedia={updateCanvasSize}
        style={{ display: "block" }}
      />
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
      {/* Debug UI */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(0, 0, 0, 0.7)",
          color: "#00ff00",
          padding: "8px 12px",
          borderRadius: "4px",
          fontFamily: "monospace",
          fontSize: "12px",
        }}
      >
        <div>Detections: {detectionCount}</div>
        {lastLatency !== null && <div>Latency: {lastLatency.toFixed(0)}ms</div>}
        {isProcessing && <div>Processing...</div>}
      </div>
    </div>
  );
}
