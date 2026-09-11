export type ExportSettings = {
  compression: "off" | "lossless" | "lossy";
  webpQuality: number;
  resizeMode: "off" | "longest" | "width" | "height";
  resizeValue: number;
  allowUpscale: boolean;
  scales: number[];
};
export const DEFAULT_EXPORT: ExportSettings = {
  compression: "off",
  webpQuality: 80,
  resizeMode: "off",
  resizeValue: 1920,
  allowUpscale: false,
  scales: [1],
};
export function validateExport(settings: ExportSettings) {
  if (
    !["off", "lossless", "lossy"].includes(settings.compression) ||
    !["off", "longest", "width", "height"].includes(settings.resizeMode) ||
    !Number.isFinite(settings.webpQuality) ||
    settings.webpQuality < 1 ||
    settings.webpQuality > 100 ||
    !Number.isInteger(settings.resizeValue) ||
    settings.resizeValue < 1 ||
    settings.resizeValue > 16000 ||
    !Array.isArray(settings.scales) ||
    !settings.scales.length ||
    settings.scales.length > 4 ||
    settings.scales.some((scale) => ![0.5, 1, 2, 3].includes(scale))
  ) {
    throw new Error("크기는 1~16,000px, 품질은 1~100으로 입력하고 내보낼 배율을 선택해 주세요.");
  }
}
export function exportPlan(width: number, height: number, settings: ExportSettings) {
  validateExport(settings);
  const divisor =
    settings.resizeMode === "width"
      ? width
      : settings.resizeMode === "height"
        ? height
        : Math.max(width, height);
  const ratio = settings.resizeMode === "off" ? 1 : settings.resizeValue / divisor;
  const seen = new Set<string>();
  return [...new Set(settings.scales)]
    .sort((a, b) => a - b)
    .flatMap((scale) => {
      const factor = settings.allowUpscale ? ratio * scale : Math.min(1, ratio * scale);
      const w = Math.max(1, Math.round(width * factor));
      const h = Math.max(1, Math.round(height * factor));
      if (w * h > 16_000_000)
        throw new Error("내보낼 이미지가 1,600만 픽셀을 넘어요. 크기나 배율을 줄여 주세요.");
      const key = `${w}x${h}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ width: w, height: h, scale, capped: ratio * scale > 1 && !settings.allowUpscale }];
    });
}
