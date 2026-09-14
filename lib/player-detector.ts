import type { ObjectDetection } from "@tensorflow-models/coco-ssd";

export type Box = [number, number, number, number];
let detector: Promise<ObjectDetection> | undefined;

async function loadDetector() {
  if (!detector) {
    detector = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const coco = await import("@tensorflow-models/coco-ssd");
      return coco.load({
        base: "mobilenet_v2",
        modelUrl: "/models/coco-ssd/model.json",
      });
    })().catch((error) => {
      detector = undefined;
      throw error;
    });
  }
  return detector;
}
export function snapshot(video: HTMLVideoElement) {
  if (video.readyState < 2 || !video.videoWidth)
    throw new Error("视频还未加载，请稍后再截取。");
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1280 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持截图。");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export function cropPhoto(canvas: HTMLCanvasElement, [x, y, w, h]: Box) {
  const crop = document.createElement("canvas");
  const left = Math.max(0, x),
    top = Math.max(0, y);
  const width = Math.min(w, canvas.width - left),
    height = Math.min(h, canvas.height - top);
  if (width < 2 || height < 2) throw new Error("框选区域太小，请重新框选。");
  const scale = Math.min(1, 240 / Math.max(width, height));
  crop.width = Math.max(1, Math.round(width * scale));
  crop.height = Math.max(1, Math.round(height * scale));
  crop
    .getContext("2d")!
    .drawImage(canvas, left, top, width, height, 0, 0, crop.width, crop.height);
  return crop.toDataURL("image/jpeg", 0.88);
}
export async function detectPeople(canvas: HTMLCanvasElement) {
  const model = await loadDetector();
  const predictions = await model.detect(canvas, 30, 0.35);
  return predictions
    .filter((p) => p.class === "person")
    .map((p) => ({ box: p.bbox as Box, confidence: p.score }));
}
