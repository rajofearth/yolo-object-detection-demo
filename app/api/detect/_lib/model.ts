import { join } from "node:path";
import * as ort from "onnxruntime-node";
import { ModelError } from "./errors";

let session: ort.InferenceSession | null = null;
let sessionInitialized = false;

export async function getSession(): Promise<ort.InferenceSession> {
  if (session !== null) {
    return session;
  }

  try {
    const modelPath = join(process.cwd(), "public", "models", "yolo11n.onnx");
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    });

    if (!sessionInitialized) {
      console.log("[YOLO] Model loaded:", modelPath);
      console.log("[YOLO] Input names:", session.inputNames);
      console.log("[YOLO] Output names:", session.outputNames);
      sessionInitialized = true;
    }

    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new ModelError(`Failed to load model: ${message}`, undefined, error);
  }
}

export function getInputName(session: ort.InferenceSession): string {
  const name = session.inputNames[0];
  if (!name) {
    throw new ModelError("Model has no input names");
  }
  return name;
}

export function getOutputName(session: ort.InferenceSession): string {
  const name = session.outputNames[0];
  if (!name) {
    throw new ModelError("Model has no output names");
  }
  return name;
}
