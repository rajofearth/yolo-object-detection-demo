import { useCallback, useEffect, useRef, useState } from "react";
import type Webcam from "react-webcam";
import { fetchDetect } from "@/app/lib/detect-client";
import type { Detection, FrameDimensions } from "@/app/lib/types";

export interface UseWebcamDetectOptions {
  readonly maxFps?: number;
  readonly minConfidence?: number;
}

export interface UseWebcamDetectResult {
  readonly detections: readonly Detection[];
  readonly detectionCount: number;
  readonly lastLatency: number | null;
  readonly isProcessing: boolean;
  readonly error: string | null;
  readonly frameDimensions: FrameDimensions | null;
}

const DEFAULT_MAX_FPS = 5;
const DEFAULT_MIN_CONFIDENCE = 0.5;
const MIN_FRAME_INTERVAL_MS = 1000 / DEFAULT_MAX_FPS;

export function useWebcamDetect(
  webcamRef: React.RefObject<Webcam | null>,
  isActive: boolean,
  options?: UseWebcamDetectOptions,
): UseWebcamDetectResult {
  const maxFps = options?.maxFps ?? DEFAULT_MAX_FPS;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minIntervalMs = 1000 / maxFps;

  const [detections, setDetections] = useState<readonly Detection[]>([]);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameDimensions, setFrameDimensions] =
    useState<FrameDimensions | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(isActive);

  // Keep ref in sync with prop
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const processFrame = useCallback(async () => {
    if (!isActiveRef.current || !webcamRef.current) {
      return;
    }

    const now = performance.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;

    if (timeSinceLastRequest < minIntervalMs) {
      const delay = minIntervalMs - timeSinceLastRequest;
      timeoutRef.current = setTimeout(() => {
        void processFrame();
      }, delay);
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      timeoutRef.current = setTimeout(() => {
        void processFrame();
      }, MIN_FRAME_INTERVAL_MS);
      return;
    }

    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsProcessing(true);
    setError(null);
    lastRequestTimeRef.current = now;

    try {
      const blob = await fetch(imageSrc).then((r) => r.blob());
      const result = await fetchDetect(blob, {
        signal: abortControllerRef.current.signal,
      });

      if (!result.success) {
        setError(result.error);
        setDetections([]);
        setLastLatency(null);
        setFrameDimensions(null);
      } else {
        const filtered = result.data.detections.filter(
          (det) => det.confidence >= minConfidence,
        );
        setDetections(filtered);
        setLastLatency(result.data.meta?.latencyMs ?? null);
        setFrameDimensions(result.data.frame);
        setError(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Request was cancelled, ignore
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Detection failed: ${message}`);
      setDetections([]);
      setLastLatency(null);
      setFrameDimensions(null);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;

      if (isActiveRef.current) {
        timeoutRef.current = setTimeout(() => {
          void processFrame();
        }, MIN_FRAME_INTERVAL_MS);
      }
    }
  }, [webcamRef, minIntervalMs, minConfidence]);

  useEffect(() => {
    if (!isActive) {
      // Cancel any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setDetections([]);
      setError(null);
      setFrameDimensions(null);
      setIsProcessing(false);
      return;
    }

    // Start the loop
    void processFrame();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, processFrame]);

  return {
    detections,
    detectionCount: detections.length,
    lastLatency,
    isProcessing,
    error,
    frameDimensions,
  };
}
