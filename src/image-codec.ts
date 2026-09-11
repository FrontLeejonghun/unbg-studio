import { decode as decodePng, encode as encodePng, convertIndexedToRgb } from "fast-png";
import type { RgbaImage } from "unbg/core";
import type { Settings } from "@/model";

export async function readPixels(file: File, canvasPixels: RgbaImage): Promise<RgbaImage> {
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 32));
  if (header[0] === 137 && header[1] === 80) {
    if (header[28] === 1 && header[24] < 8)
      throw new Error(
        "저비트 인터레이스 PNG는 다른 형식 변환을 지원하지 않아요. PNG를 선택하면 원본 그대로 저장해요.",
      );
    const decoded = decodePng(bytes, { checkCrc: true });
    if (decoded.depth === 16) {
      throw new Error(
        "16-bit PNG는 다른 형식으로 무손실 변환할 수 없어요. PNG 형식을 선택하면 원본 그대로 저장해요.",
      );
    }
    if (decoded.depth < 8 && !decoded.palette) {
      const rgba = new Uint8Array(decoded.width * decoded.height * 4);
      const maximum = (1 << decoded.depth) - 1;
      const rowBytes = Math.ceil((decoded.width * decoded.depth) / 8);
      for (let y = 0; y < decoded.height; y++) {
        for (let x = 0; x < decoded.width; x++) {
          const bit = x * decoded.depth;
          const sample =
            (decoded.data[y * rowBytes + Math.floor(bit / 8)] >> (8 - decoded.depth - (bit % 8))) &
            maximum;
          const gray = Math.round((sample / maximum) * 255);
          const offset = (y * decoded.width + x) * 4;
          rgba.set([gray, gray, gray, decoded.transparency?.[0] === sample ? 0 : 255], offset);
        }
      }
      return { width: decoded.width, height: decoded.height, data: rgba };
    }
    const values = decoded.palette ? convertIndexedToRgb(decoded) : decoded.data;
    const channels = decoded.palette ? decoded.palette[0].length : decoded.channels;
    const rgba = new Uint8Array(decoded.width * decoded.height * 4);
    for (let pixel = 0; pixel < decoded.width * decoded.height; pixel++) {
      const source = pixel * channels;
      const target = pixel * 4;
      rgba[target] = values[source];
      rgba[target + 1] = values[source + (channels > 2 ? 1 : 0)];
      rgba[target + 2] = values[source + (channels > 2 ? 2 : 0)];
      rgba[target + 3] = channels === 2 || channels === 4 ? values[source + channels - 1] : 255;
      if (
        decoded.transparency &&
        decoded.transparency.every((value, channel) => values[source + channel] === value)
      )
        rgba[target + 3] = 0;
    }
    return { width: decoded.width, height: decoded.height, data: rgba };
  }
  if (new TextDecoder().decode(header.slice(8, 12)) === "WEBP") {
    const { default: decode } = await import("@jsquash/webp/decode.js");
    const result = await decode(bytes);
    return { width: result.width, height: result.height, data: new Uint8Array(result.data) };
  }
  return canvasPixels;
}

export async function encodeImage(image: RgbaImage, settings: Settings): Promise<Blob> {
  if (settings.format === "png") {
    const bytes = encodePng({
      width: image.width,
      height: image.height,
      data: image.data,
      channels: 4,
      depth: 8,
    });
    return new Blob([new Uint8Array(bytes)], { type: "image/png" });
  }
  if (settings.format === "webp") {
    const { default: encode } = await import("@jsquash/webp/encode.js");
    const bytes = await encode(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      {
        lossless: 1,
        near_lossless: 100,
        quality: 100,
        exact: 1,
        method: 4,
      },
    );
    return new Blob([bytes], { type: "image/webp" });
  }
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 저장할 수 없어요. 최신 브라우저에서 다시 시도해 주세요.");
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  );
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, image.width, image.height);
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: settings.jpegQuality / 100,
  });
  if (blob.type !== "image/jpeg")
    throw new Error("이 브라우저는 JPG 저장을 지원하지 않아요. PNG를 선택해 주세요.");
  return blob;
}
