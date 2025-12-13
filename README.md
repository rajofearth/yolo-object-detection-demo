# YOLO WebGPU Local Detector

Real-time object detection using **YOLOv11x** exported to **ONNX**, running **locally** with the **WebGPU** execution provider.

## What this is

A webcam demo that runs a YOLO model on your own machine:

- **Client**: captures frames from your webcam and draws bounding boxes.
- **Server (Next.js route)**: preprocesses the frame, runs ONNX inference with **WebGPU** via `onnxruntime-node`, then returns detections.

## The vibe (my fun take)

> Oi, listen up, you bloody beauty. I’m runnin’ this YOLOv11x model—proper beast—exported to ONNX straight on WebGPU, local as you like, with real-time detection flyin’ across the screen. And get this: the whole thing’s sippin’ barely 1–3 gigs of RAM, no more. Meanwhile, it’s absolutely smokin’ the GPU, peggin’ it at near 100%, but the laptop’s cool as a cucumber—fans ain’t even bothered to spin up. Not a whisper from ’em. Proper efficient, innit? Makes you wonder why the rest of the world bothers with all that cloud bollocks when you can smash it right here on your own machine. Brilliant.

## Requirements

- Node.js (recent)
- **pnpm** (this repo uses `pnpm-lock.yaml`)
- A GPU + drivers that support **WebGPU** on your platform

## Getting started

Install deps:

```bash
pnpm install
```

Run dev:

```bash
pnpm dev
```

Open `http://localhost:3000`.

## How it works (code map)

- **UI**: `app/components/DetectView.tsx`
  - Uses `react-webcam` to capture frames.
  - Renders detections on `OverlayCanvas`.
- **Capture loop**: `app/hooks/useWebcamDetect.ts`
  - Grabs screenshots and calls the detect endpoint at a capped FPS.
- **Detect endpoint**: `app/api/detect/route.ts`
  - Accepts `multipart/form-data` with a `frame` image.
  - Preprocesses, runs inference, postprocesses boxes.
- **Model session**: `app/api/detect/_lib/model.ts`
  - Loads `public/models/yolo11x.onnx`.
  - Creates an ONNX Runtime session with execution providers: `webgpu`, then `cpu` fallback.

## Models

Models live in:

- `public/models/yolo11x.onnx`
- `public/models/yolo11n.onnx`

To switch the model, update the path in `app/api/detect/_lib/model.ts`.

## Performance notes

Actual performance depends on your GPU, drivers, and model size.

- Expect **high GPU utilization** (that’s the point).
- RAM usage can stay relatively modest because inference is local and avoids heavyweight cloud/streaming overhead.

## Troubleshooting

- **WebGPU provider not available**: you’ll fall back to CPU. Check your OS/driver support and ONNX Runtime WebGPU availability for your platform.
- **Camera permissions**: allow camera access in your browser.
- **Inference errors**: check server logs for the requestId-prefixed messages.

## Scripts

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm start` — start production server
- `pnpm lint` — run Biome checks
- `pnpm format` — format with Biome
