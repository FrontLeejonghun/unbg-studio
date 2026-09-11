import type { DifferenceMattingOptions, Rgb } from "unbg/core";
export type Settings = {
  mode: "convert" | "ai" | "pair";
  format: "png" | "webp" | "jpg";
  jpegQuality: number;
  background1: string;
  background2: string;
  channelThreshold: number;
  floor: number;
  ceiling: number;
  cropMode: "off" | "auto" | "threshold";
  cropThreshold: number;
  suffix: string;
};
export const DEFAULT_SETTINGS: Settings = {
  mode: "convert",
  format: "png",
  jpegQuality: 95,
  background1: "",
  background2: "",
  channelThreshold: 10,
  floor: 0,
  ceiling: 1,
  cropMode: "off",
  cropThreshold: 0.02,
  suffix: "-converted",
};
export type Asset = { file: File; url: string };
export type Output = {
  blob: Blob;
  width: number;
  height: number;
  background1?: Rgb;
  background2?: Rgb;
  backgroundDistance?: number;
  engine?: string;
  durationMs: number;
  cropClippingThreshold: number | null;
};
export type Pair = {
  id: string;
  name: string;
  first?: Asset;
  second?: Asset;
  status: "idle" | "processing" | "done" | "error";
  selected: boolean;
  output?: Output & { url: string };
  error?: string;
};
export type WorkerRequest = { first: File; second?: File; settings: Settings };
export type ProcessingProgress = { message: string; percent?: number };
export type WorkerResponse =
  | { type: "progress"; progress: ProcessingProgress }
  | { type: "result"; ok: true; output: Output }
  | { type: "result"; ok: false; error: string };
export function parseColor(value: string): Rgb | undefined {
  if (!value.trim()) return undefined;
  const hex = /^#?([\da-f]{6})$/i.exec(value.trim());
  if (hex)
    return {
      r: parseInt(hex[1].slice(0, 2), 16),
      g: parseInt(hex[1].slice(2, 4), 16),
      b: parseInt(hex[1].slice(4, 6), 16),
    };
  const rgb = value.split(",").map(Number);
  if (
    rgb.length === 3 &&
    value.split(",").every((v) => v.trim()) &&
    rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)
  )
    return { r: rgb[0], g: rgb[1], b: rgb[2] };
  throw new Error("배경색은 #ffffff 또는 255,255,255 형식으로 입력해 주세요.");
}
export function getOptions(settings: Settings): DifferenceMattingOptions {
  if (
    !Number.isFinite(settings.jpegQuality) ||
    settings.jpegQuality < 1 ||
    settings.jpegQuality > 100
  )
    throw new Error("JPG 품질은 1~100 사이로 설정해 주세요.");
  if (settings.mode === "convert") return {};
  if (settings.format === "jpg")
    throw new Error("배경 제거 결과는 투명도를 지원하는 PNG 또는 WebP로 저장해 주세요.");
  const { floor, ceiling, channelThreshold } = settings;
  if (![floor, ceiling, channelThreshold, settings.cropThreshold].every(Number.isFinite))
    throw new Error("옵션에 올바른 숫자를 입력해 주세요.");
  if (
    floor < 0 ||
    ceiling > 1 ||
    floor > ceiling ||
    channelThreshold < 0 ||
    channelThreshold > 255 ||
    settings.cropThreshold < 0 ||
    settings.cropThreshold > 1
  )
    throw new Error("투명도 하한은 상한보다 작거나 같아야 합니다. 옵션 범위를 확인해 주세요.");
  return {
    background1: settings.mode === "pair" ? parseColor(settings.background1) : undefined,
    background2: settings.mode === "pair" ? parseColor(settings.background2) : undefined,
    floor,
    ceiling,
    channelThreshold,
  };
}
function safeCharacters(value: string): string {
  return Array.from(value, (character) => (character.charCodeAt(0) < 32 ? "_" : character))
    .join("")
    .replace(/[\\/:*?"<>|]/g, "_");
}
export function cleanName(name: string): string {
  return (
    safeCharacters(name.replace(/\.[^.]+$/, ""))
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 120) || "image"
  );
}
export function pairFiles(files: File[]): { name: string; first: File; second?: File }[] {
  const groups = new Map<string, { name: string; first?: File; second?: File }>();
  const unmatched: File[] = [];
  for (const file of files) {
    const base = cleanName(file.name);
    const match = /^(.*?)[-_ ](white|black|light|dark|bg1|bg2|a|b|흰색|검정)$/i.exec(base);
    if (!match || !match[1]) {
      unmatched.push(file);
      continue;
    }
    const key = match[1].toLowerCase();
    const slot = /^(white|light|bg1|a|흰색)$/i.test(match[2]) ? "first" : "second";
    const group = groups.get(key) ?? { name: match[1] };
    if (group[slot]) {
      unmatched.push(file);
      continue;
    }
    group[slot] = file;
    groups.set(key, group);
  }
  const results: { name: string; first: File; second?: File }[] = [];
  for (const group of groups.values()) {
    if (group.first && group.second)
      results.push({ name: group.name, first: group.first, second: group.second });
    else {
      const file = group.first ?? group.second;
      if (file) unmatched.push(file);
    }
  }
  unmatched.sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
  for (let i = 0; i < unmatched.length; i += 2)
    results.push({
      name: cleanName(unmatched[i].name),
      first: unmatched[i],
      second: unmatched[i + 1],
    });
  return results;
}
export function fileSize(size: number): string {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}
export function colorHex(color: Rgb): string {
  return (
    "#" +
    [color.r, color.g, color.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function outputNames(
  pairs: Pair[],
  suffix: string,
  format: Settings["format"] = "png",
): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const pair of pairs) {
    const base =
      (safeCharacters(pair.name).replace(/^\.+/, "").trim().slice(0, 120) || "image") +
      safeCharacters(suffix).slice(0, 50);
    let name = `${base}.${format}`;
    let counter = 2;
    while (used.has(name.toLowerCase())) name = `${base}-${counter++}.${format}`;
    used.add(name.toLowerCase());
    names.set(pair.id, name);
  }
  return names;
}
