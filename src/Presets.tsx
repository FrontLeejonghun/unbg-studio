import { useState } from "react";
import { Bookmark, Plus, X } from "lucide-react";
import { DEFAULT_SETTINGS, getOptions } from "@/model";
import type { Settings } from "@/model";
import type { ExportSettings } from "@/export-plan";
type Recipe = ExportSettings & Pick<Settings, "format" | "jpegQuality" | "suffix">;
type Preset = { id: string; name: string; recipe: Recipe };
const STORAGE_KEY = "unbg-studio:export-presets:v1";
function recipeOf(settings: Settings): Recipe {
  const {
    compression,
    webpQuality,
    resizeMode,
    resizeValue,
    allowUpscale,
    scales,
    format,
    jpegQuality,
    suffix,
  } = settings;
  return {
    compression,
    webpQuality,
    resizeMode,
    resizeValue,
    allowUpscale,
    scales: [...scales],
    format,
    jpegQuality,
    suffix,
  };
}
function loadPresets(): Preset[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 12).filter((entry): entry is Preset => {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        entry.name.length > 40 ||
        !entry.recipe ||
        typeof entry.recipe !== "object"
      )
        return false;
      const recipe = entry.recipe as Record<string, unknown>;
      const defaults = recipeOf(DEFAULT_SETTINGS);
      if (
        !Object.entries(defaults).every(([key, value]) =>
          Array.isArray(value) ? Array.isArray(recipe[key]) : typeof recipe[key] === typeof value,
        )
      )
        return false;
      if (
        !["png", "webp", "jpg"].includes(String(recipe.format)) ||
        String(recipe.suffix).length > 50
      )
        return false;
      try {
        getOptions({ ...DEFAULT_SETTINGS, ...recipe } as Settings);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
const BUILT_INS: { name: string; detail: string; patch: Partial<Recipe> }[] = [
  {
    name: "웹 업로드",
    detail: "WebP · 품질 80 · 긴 변 1920px",
    patch: {
      format: "webp",
      compression: "lossy",
      webpQuality: 80,
      resizeMode: "longest",
      resizeValue: 1920,
    },
  },
  {
    name: "썸네일",
    detail: "WebP · 너비 480px · 1× / 2×",
    patch: {
      format: "webp",
      compression: "lossy",
      webpQuality: 80,
      resizeMode: "width",
      resizeValue: 480,
      scales: [1, 2],
    },
  },
  {
    name: "무손실 보관",
    detail: "PNG · 무손실 압축 · 원본 크기",
    patch: { format: "png", compression: "lossless", resizeMode: "off" },
  },
];
export function Presets({
  settings,
  onChange,
  onMessage,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onMessage: (message: string) => void;
}) {
  const [presets, setPresets] = useState(loadPresets);
  const [name, setName] = useState("");
  function persist(next: Preset[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPresets(next);
      return true;
    } catch {
      onMessage("설정을 저장하지 못했어요. 브라우저의 사이트 저장 공간을 확인해 주세요.");
      return false;
    }
  }
  function apply(recipe: Recipe) {
    const next = { ...settings, ...recipeOf({ ...DEFAULT_SETTINGS, ...recipe }) };
    if (settings.mode !== "convert" && next.format === "jpg") {
      next.format = "png";
      next.compression = "lossless";
    }
    onChange(next);
  }
  return (
    <div className="option-section presets-section">
      <h3>
        <Bookmark size={14} /> 빠른 설정
      </h3>
      <div className="preset-chips">
        {BUILT_INS.map((preset) => (
          <button
            key={preset.name}
            className="preset-chip"
            title={preset.detail}
            onClick={() => apply({ ...recipeOf(DEFAULT_SETTINGS), ...preset.patch })}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <details className="saved-presets">
        <summary>
          내 프리셋 <span>{presets.length} / 12</span>
        </summary>
        <p className="section-help">
          저장 형식·압축·크기·파일명을 이 브라우저에 저장해요. 배경 제거 설정은 유지해요.
        </p>
        <div className="preset-save">
          <input
            aria-label="프리셋 이름"
            placeholder="예: 포트폴리오 업로드"
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            className="icon-button"
            aria-label="현재 옵션을 프리셋으로 저장"
            title="현재 옵션 저장"
            disabled={!name.trim() || presets.length >= 12}
            onClick={() => {
              try {
                getOptions(settings);
              } catch {
                onMessage("올바른 옵션을 입력한 뒤 저장해 주세요.");
                return;
              }
              if (
                persist([
                  ...presets,
                  { id: crypto.randomUUID(), name: name.trim(), recipe: recipeOf(settings) },
                ])
              ) {
                setName("");
                onMessage("프리셋을 저장했어요. 다음 방문에도 사용할 수 있어요.");
              }
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        {presets.map((preset) => (
          <div className="saved-preset" key={preset.id}>
            <button
              onClick={() => apply(preset.recipe)}
              title={`${preset.recipe.format.toUpperCase()} · ${preset.recipe.resizeMode === "off" ? "원본 크기" : `${preset.recipe.resizeValue}px`}`}
            >
              {preset.name}
            </button>
            <button
              className="icon-button"
              aria-label={`${preset.name} 프리셋 삭제`}
              onClick={() => persist(presets.filter((item) => item.id !== preset.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </details>
    </div>
  );
}
