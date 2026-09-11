import { AutoModel, AutoProcessor, RawImage, Tensor, env } from "@huggingface/transformers";
import type { PretrainedModelOptions } from "@huggingface/transformers";
import type { RgbaImage } from "unbg/core";
import type { ProcessingProgress, Settings } from "@/model";

const MODEL_ID = "briaai/RMBG-1.4";
const MODEL_REVISION = "2ceba5a5efaec153162aedea169f76caf9b46cf8";
type Progress = (progress: ProcessingProgress) => void;
type Engine = {
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
};
let enginePromise: Promise<Engine> | undefined;

env.allowLocalModels = false;
env.useWasmCache = false;
if (env.backends.onnx.wasm) {
  const runtime = new URL("/vendor/transformers-4.2.0/", self.location.href);
  env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL("ort-wasm-simd-threaded.mjs", runtime).href,
    wasm: new URL("ort-wasm-simd-threaded.wasm", runtime).href,
  };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

async function loadEngine(progress: Progress): Promise<Engine> {
  const progressCallback: NonNullable<PretrainedModelOptions["progress_callback"]> = (event) => {
    if (event.status === "progress" && event.file.endsWith(".onnx")) {
      progress({
        message: `모델 다운로드 · ${(event.loaded / 1024 / 1024).toFixed(0)} / ${(event.total / 1024 / 1024).toFixed(0)} MB`,
        percent: Math.min(100, Math.round(event.progress)),
      });
    } else if (event.status === "done" && event.file.endsWith(".onnx")) {
      progress({ message: "모델을 준비하고 있어요. 첫 실행은 잠시 걸릴 수 있어요." });
    }
  };
  progress({ message: "무료 모델을 불러오고 있어요. 첫 다운로드는 약 42 MB예요." });
  const processor = await AutoProcessor.from_pretrained(MODEL_ID, { revision: MODEL_REVISION });
  const model = await AutoModel.from_pretrained(MODEL_ID, {
    revision: MODEL_REVISION,
    dtype: "q8",
    device: "wasm",
    progress_callback: progressCallback,
  });
  return { model, processor };
}

export async function removeBackground(image: RgbaImage, settings: Settings, progress: Progress) {
  enginePromise ??= loadEngine(progress).catch((error: unknown) => {
    enginePromise = undefined;
    throw error;
  });
  const engine = await enginePromise;
  progress({
    message: "배경을 제거하고 있어요 · 내 기기에서 처리 중",
  });
  const input = new RawImage(new Uint8Array(image.data), image.width, image.height, 4).rgb();
  const inputs = await engine.processor(input);
  let result: unknown;
  try {
    result = await engine.model({ input: inputs.pixel_values });
  } catch {
    enginePromise = undefined;
    await engine.model.dispose().catch(() => undefined);
    throw new Error(
      "모델 실행을 완료하지 못했어요. 다른 탭을 닫고 최신 브라우저에서 다시 시도해 주세요.",
    );
  } finally {
    if (inputs.pixel_values instanceof Tensor) inputs.pixel_values.dispose();
  }
  if (
    !result ||
    typeof result !== "object" ||
    !("output" in result) ||
    !(result.output instanceof Tensor)
  ) {
    throw new Error("모델 결과를 읽지 못했어요. 다시 시도해 주세요.");
  }
  const output = result.output;
  let min = Infinity;
  let max = -Infinity;
  for (const value of output.data) {
    const score = Number(value);
    if (!Number.isFinite(score)) {
      output.dispose();
      throw new Error("모델 결과가 올바르지 않아요. 다른 이미지로 다시 시도해 주세요.");
    }
    min = Math.min(min, score);
    max = Math.max(max, score);
  }
  let mask: RawImage;
  try {
    const normalized = output
      .squeeze(0)
      .sub(min)
      .div(Math.max(max - min, 1e-6))
      .mul(255)
      .to("uint8");
    mask = await RawImage.fromTensor(normalized).resize(image.width, image.height);
    normalized.dispose();
  } finally {
    output.dispose();
  }
  for (let pixel = 0; pixel < image.width * image.height; pixel++) {
    const alpha = mask.data[pixel] / 255;
    const adjusted = alpha <= settings.floor ? 0 : alpha >= settings.ceiling ? 1 : alpha;
    image.data[pixel * 4 + 3] = Math.round(image.data[pixel * 4 + 3] * adjusted);
  }
  progress({ message: "투명 PNG를 만들고 있어요." });
  return { image, engine: "BRIA RMBG 1.4 · CPU" };
}
