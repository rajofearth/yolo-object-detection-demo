"use client";

import type React from "react";
import { useRef, useState } from "react";
import Webcam from "react-webcam";
import { useWebcamDetect } from "@/app/hooks/useWebcamDetect";
import { SITE_NAME, SITE_TAGLINE } from "@/app/lib/branding";
import { OverlayCanvas } from "./OverlayCanvas";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

export function DetectView(): React.JSX.Element {
  const webcamRef = useRef<Webcam>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isDetectionActive, setIsDetectionActive] = useState(true);

  const {
    detections,
    detectionCount,
    lastLatency,
    isProcessing,
    error,
    frameDimensions,
  } = useWebcamDetect(webcamRef, isDetectionActive && isCameraActive);

  const toggleDetection = () => {
    setIsDetectionActive((prev) => !prev);
  };

  const toggleCamera = () => {
    setIsCameraActive((prev) => {
      const newState = !prev;
      if (!newState) {
        setIsDetectionActive(false);
      }
      return newState;
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        width: "100%",
        gap: "14px",
        padding: "20px",
      }}
    >
      <header style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "-0.5px",
          }}
        >
          {SITE_NAME}
        </div>
        <div style={{ fontSize: "14px", opacity: 0.8 }}>{SITE_TAGLINE}</div>
      </header>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          {isCameraActive ? (
            <Webcam
              ref={webcamRef}
              width={VIDEO_WIDTH}
              height={VIDEO_HEIGHT}
              videoConstraints={{
                width: VIDEO_WIDTH,
                height: VIDEO_HEIGHT,
              }}
              style={{ display: "block" }}
            />
          ) : (
            <div
              style={{
                width: VIDEO_WIDTH,
                height: VIDEO_HEIGHT,
                background: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "18px",
              }}
            >
              Camera Stopped
            </div>
          )}
          {isCameraActive && (
            <OverlayCanvas
              webcamRef={webcamRef}
              detections={detections}
              frameDimensions={frameDimensions}
            />
          )}
          {/* Control Buttons */}
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={toggleDetection}
              disabled={!isCameraActive}
              style={{
                padding: "10px 20px",
                backgroundColor: isDetectionActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: isCameraActive ? "pointer" : "not-allowed",
                fontSize: "14px",
                fontWeight: "600",
                transition: "background-color 0.2s",
                opacity: isCameraActive ? 1 : 0.5,
              }}
              onMouseEnter={(e) => {
                if (isCameraActive) {
                  e.currentTarget.style.opacity = "0.9";
                }
              }}
              onMouseLeave={(e) => {
                if (isCameraActive) {
                  e.currentTarget.style.opacity = "1";
                }
              }}
            >
              {isDetectionActive ? "Stop Detection" : "Start Detection"}
            </button>
            <button
              type="button"
              onClick={toggleCamera}
              style={{
                padding: "10px 20px",
                backgroundColor: isCameraActive ? "#ef4444" : "#22c55e",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              {isCameraActive ? "Stop Camera" : "Start Camera"}
            </button>
          </div>
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
            {lastLatency !== null && (
              <div>Latency: {lastLatency.toFixed(0)}ms</div>
            )}
            {isProcessing && <div>Processing...</div>}
            {error && (
              <div style={{ color: "#ff4444", marginTop: "4px" }}>
                Error: {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
