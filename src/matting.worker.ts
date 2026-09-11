import { cropContent, cropTransparent, differenceMatting } from "unbg/core";
import type { RgbaImage } from "unbg/core";
import { getOptions } from "@/model";
import type { WorkerRequest, WorkerResponse } from "@/model";
const port = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (response: WorkerResponse) => void;
};
async function decode(file: File): Promise<RgbaImage> {
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const isPng = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
  const isJpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const isWebp =
    new TextDecoder().decode(header.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(header.slice(8, 12)) === "WEBP";
  if (!isPng && !isJpeg && !isWebp) throw new Error("PNG, JPG, 정적 WebP 파일만 지원합니다.");
  if (isWebp && new TextDecoder().decode(header.slice(12, 16)) === "VP8X" && header[20] & 2)
    throw new Error("움직이는 WebP는 지원하지 않습니다. 정지 이미지로 저장해 주세요.");
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
      if (data[i] !== 255)
        throw new Error(
          "원본에 투명한 픽셀이 있습니다. 단색 배경 위에 합친 이미지 두 장을 사용해 주세요.",
        );
    return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(data.buffer) };
  } finally {
    bitmap.close();
  }
}
port.onmessage = async ({ data: { first, second, settings } }) => {
  try {
    const a = await decode(first);
    const b = await decode(second);
    if (a.width !== b.width || a.height !== b.height)
      throw new Error(
        `두 이미지 크기가 다릅니다 (${a.width}×${a.height} / ${b.width}×${b.height}). 같은 크기로 맞춰 주세요.`,
      );
    const matte = differenceMatting(a, b, getOptions(settings));
    const result =
      settings.cropMode === "auto"
        ? cropContent(matte)
        : settings.cropMode === "threshold"
          ? cropTransparent(matte, settings.cropThreshold)
          : matte;
    const canvas = new OffscreenCanvas(result.width, result.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PNG를 만들 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.");
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
      0,
      0,
    );
    const blob = await canvas.convertToBlob({ type: "image/png" });
    port.postMessage({
      ok: true,
      output: {
        blob,
        width: result.width,
        height: result.height,
        background1: matte.background1,
        background2: matte.background2,
        backgroundDistance: matte.backgroundDistance,
        cropClippingThreshold: matte.cropClippingThreshold,
      },
    });
  } catch (error) {
    let message =
      error instanceof Error
        ? error.message
        : "변환에 실패했습니다. 파일을 확인한 뒤 다시 시도해 주세요.";
    if (/No usable background channels/.test(message))
      message =
        "배경색이 너무 비슷합니다. 다른 배경의 이미지로 바꾸거나 채널 임계값을 낮춰 주세요.";
    if (/could not be decoded|source image|InvalidState/i.test(message))
      message = "이미지를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요.";
    port.postMessage({ ok: false, error: message });
  }
};
