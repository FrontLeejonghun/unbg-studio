import { cropContent, cropTransparent, differenceMatting } from "unbg/core";
import type { RgbaImage } from "unbg/core";
import { getOptions } from "@/model";
import { encodeImage, readPixels, resizeImage } from "@/image-codec";
import { exportPlan } from "@/export-plan";
import type { WorkerRequest, WorkerResponse, Output, OutputVariant } from "@/model";
const port = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (response: WorkerResponse) => void;
};
async function decode(file: File, opaque: boolean, allowAnimatedPng = false): Promise<RgbaImage> {
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const isPng = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
  const isJpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const isWebp =
    new TextDecoder().decode(header.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(header.slice(8, 12)) === "WEBP";
  if (!isPng && !isJpeg && !isWebp) throw new Error("PNG, JPG, 정적 WebP 파일만 지원합니다.");
  if (isWebp && new TextDecoder().decode(header.slice(12, 16)) === "VP8X" && header[20] & 2)
    throw new Error("움직이는 WebP는 지원하지 않습니다. 정지 이미지로 저장해 주세요.");
  if (isPng && !allowAnimatedPng) {
    const bytes = await file.arrayBuffer();
    const view = new DataView(bytes);
    for (let offset = 8; offset + 12 <= bytes.byteLength;) {
      const length = view.getUint32(offset);
      if (length > bytes.byteLength - offset - 12) break;
      if (view.getUint32(offset + 4) === 0x6163544c)
        throw new Error(
          "움직이는 PNG는 변환·배경 제거를 지원하지 않아요. 배경 제거·압축·크기 조절을 끄고 PNG, 1×를 선택해 주세요.",
        );
      offset += length + 12;
    }
  }
  const bitmap = await createImageBitmap(file, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  try {
    if (bitmap.width * bitmap.height > 16_000_000)
      throw new Error("이미지 한 장은 1,600만 픽셀까지 지원합니다. 크기를 줄여 주세요.");
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
      throw new Error(
        "이 브라우저에서 이미지 처리를 시작할 수 없습니다. 최신 브라우저를 사용해 주세요.",
      );
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    for (let i = 3; i < data.length; i += 4)
      if (opaque && data[i] !== 255)
        throw new Error(
          "원본에 투명한 픽셀이 있습니다. 단색 배경 위에 합친 이미지 두 장을 사용해 주세요.",
        );
    return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(data.buffer) };
  } finally {
    bitmap.close();
  }
}
port.onmessage = async ({ data: { first, second, settings } }) => {
  const startedAt = performance.now();
  try {
    getOptions(settings);
    const a = await decode(
      first,
      settings.mode === "pair",
      settings.mode === "convert" &&
        settings.format === "png" &&
        settings.compression === "off" &&
        settings.resizeMode === "off" &&
        settings.scales.length === 1 &&
        settings.scales[0] === 1,
    );
    const signature = new Uint8Array(await first.slice(0, 12).arrayBuffer());
    const inputFormat = signature[0] === 137 ? "png" : signature[0] === 255 ? "jpg" : "webp";
    let matte: RgbaImage;
    let metadata: Pick<
      Output,
      "background1" | "background2" | "backgroundDistance" | "cropClippingThreshold" | "engine"
    > = { cropClippingThreshold: null };
    if (settings.mode === "convert") {
      const plan = exportPlan(a.width, a.height, settings);
      if (
        inputFormat === settings.format &&
        settings.compression === "off" &&
        plan.length === 1 &&
        plan[0].width === a.width &&
        plan[0].height === a.height
      ) {
        port.postMessage({
          type: "result",
          ok: true,
          output: {
            blob: first,
            width: a.width,
            height: a.height,
            cropClippingThreshold: null,
            durationMs: Math.round(performance.now() - startedAt),
            engine: "원본 파일 그대로 · 재압축 없음",
          },
        });
        return;
      }
      matte = await readPixels(first, a);
      metadata.engine =
        settings.format === "jpg" ? "JPG 고품질 변환 · 손실 압축" : "픽셀 기준 무손실 변환";
    } else if (settings.mode === "ai") {
      const { removeBackground } = await import("@/ai");
      const result = await removeBackground(a, settings, (progress) =>
        port.postMessage({ type: "progress", progress }),
      );
      matte = result.image;
      metadata.engine = result.engine;
    } else {
      if (!second) throw new Error("두 번째 이미지를 추가해 주세요.");
      const b = await decode(second, true);
      if (a.width !== b.width || a.height !== b.height)
        throw new Error(
          `두 이미지 크기가 다릅니다 (${a.width}×${a.height} / ${b.width}×${b.height}). 같은 크기로 맞춰 주세요.`,
        );
      const difference = differenceMatting(a, b, getOptions(settings));
      matte = difference;
      metadata = {
        background1: difference.background1,
        background2: difference.background2,
        backgroundDistance: difference.backgroundDistance,
        cropClippingThreshold: difference.cropClippingThreshold,
      };
    }
    const result =
      settings.mode !== "convert" && settings.cropMode === "auto"
        ? cropContent(matte)
        : settings.mode !== "convert" && settings.cropMode === "threshold"
          ? cropTransparent(matte, settings.cropThreshold)
          : matte;
    const variants: OutputVariant[] = [];
    for (const size of exportPlan(result.width, result.height, settings)) {
      port.postMessage({
        type: "progress",
        progress: { message: `${size.width} × ${size.height} 이미지 저장 중…` },
      });
      const resized = resizeImage(result, size.width, size.height);
      let blob = await encodeImage(resized, settings);
      const originalKept =
        settings.mode === "convert" &&
        inputFormat === settings.format &&
        resized === result &&
        blob.size >= first.size;
      if (originalKept) blob = first;
      variants.push({ ...size, blob, originalKept });
    }
    const primary = variants.find((variant) => variant.scale === 1) ?? variants[0];
    metadata.engine = [
      settings.mode === "convert" ? "형식 변환" : (metadata.engine ?? "unbg 배경 제거"),
      settings.compression === "lossy" || settings.format === "jpg" ? "손실 압축" : "무손실 인코딩",
      settings.resizeMode !== "off" || settings.scales.some((scale) => scale !== 1)
        ? "크기 조절 적용"
        : "원본 크기",
      variants.some((variant) => variant.originalKept) ? "더 작은 원본 유지" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    port.postMessage({
      type: "result",
      ok: true,
      output: {
        blob: primary.blob,
        width: primary.width,
        height: primary.height,
        variants,
        ...metadata,
        durationMs: Math.round(performance.now() - startedAt),
      },
    });
  } catch (error) {
    let message =
      error instanceof Error
        ? error.message
        : "변환에 실패했어요. 다른 탭을 닫고 다시 시도해 주세요.";
    if (/No usable background channels/.test(message))
      message =
        "배경색이 너무 비슷합니다. 다른 배경의 이미지로 바꾸거나 채널 임계값을 낮춰 주세요.";
    if (/could not be decoded|source image|InvalidState/i.test(message))
      message = "이미지를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.";
    if (
      /Failed to fetch|NetworkError|fetch failed|Unauthorized|Could not locate|not found|403|401/i.test(
        message,
      )
    )
      message =
        settings.mode === "ai"
          ? "모델을 내려받지 못했어요. 인터넷 연결이나 다운로드 차단을 확인한 뒤 다시 시도해 주세요."
          : "변환에 필요한 파일을 내려받지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.";
    if (/Aborted|CompileError|WebAssembly|Encoding error/i.test(message))
      message = "이미지 처리 모듈을 실행하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.";
    port.postMessage({
      type: "result",
      ok: false,
      error: message,
    });
  }
};
