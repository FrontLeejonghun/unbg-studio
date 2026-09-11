import { ChevronDown, Scaling, Layers2 } from "lucide-react";
import { exportPlan } from "@/export-plan";
import type { Settings } from "@/model";
export function ExportOptions({
  settings,
  onChange,
  sourceSize,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  sourceSize?: { width: number; height: number };
}) {
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    onChange({ ...settings, [key]: value });
  }
  let plan: ReturnType<typeof exportPlan> = [];
  try {
    if (sourceSize) plan = exportPlan(sourceSize.width, sourceSize.height, settings);
  } catch {
    /* Parent displays validation errors. */
  }
  return (
    <>
      <details
        className="option-section export-details"
        open={settings.resizeMode !== "off" || undefined}
      >
        <summary>
          <span>
            <Scaling size={15} />
            크기 조절
          </span>
          <span>
            {settings.resizeMode === "off" ? "원본" : `${settings.resizeValue}px`}
            <ChevronDown size={14} />
          </span>
        </summary>
        <div className="select-wrap">
          <select
            aria-label="크기 조절 기준"
            value={settings.resizeMode}
            onChange={(event) => update("resizeMode", event.target.value as Settings["resizeMode"])}
          >
            <option value="off">원본 크기 유지</option>
            <option value="longest">긴 변 기준</option>
            <option value="width">너비 기준</option>
            <option value="height">높이 기준</option>
          </select>
        </div>
        {settings.resizeMode !== "off" && (
          <label className="dimension-field">
            <input
              type="number"
              aria-label="기준 크기 픽셀"
              min={1}
              max={16000}
              step={1}
              value={settings.resizeValue}
              onChange={(event) => update("resizeValue", Number(event.target.value))}
            />
            <span>px</span>
          </label>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={settings.allowUpscale}
            onChange={(event) => update("allowUpscale", event.target.checked)}
          />
          원본보다 크게 확대 허용
        </label>
        <p className="section-help">
          가로·세로 비율을 유지해요. 크기 조절은 픽셀을 바꾸므로 원본과 동일한 무손실 변환은
          아니에요.
        </p>
      </details>
      <details
        className="option-section export-details"
        open={settings.scales.length > 1 || undefined}
      >
        <summary>
          <span>
            <Layers2 size={15} />
            여러 크기로 저장
          </span>
          <span>
            {settings.scales.length}개<ChevronDown size={14} />
          </span>
        </summary>
        <p className="section-help">위에서 정한 크기를 1×로 사용해요.</p>
        <div className="scale-choices">
          {[0.5, 1, 2, 3].map((scale) => (
            <label key={scale} className={settings.scales.includes(scale) ? "selected" : ""}>
              <input
                type="checkbox"
                aria-label={`${scale}배 크기 내보내기`}
                checked={settings.scales.includes(scale)}
                onChange={(event) =>
                  update(
                    "scales",
                    event.target.checked
                      ? [...settings.scales, scale].sort((a, b) => a - b)
                      : settings.scales.filter((value) => value !== scale),
                  )
                }
              />
              {scale}×
            </label>
          ))}
        </div>
        {plan.length > 0 && (
          <div className="size-plan" aria-label="예상 내보내기 크기">
            {plan.map((size) => (
              <span key={`${size.width}x${size.height}`}>
                {size.width} × {size.height}
                {size.capped ? " · 원본 한도" : ""}
              </span>
            ))}
          </div>
        )}
        <p className="section-help">
          확대를 끄면 원본 크기까지만 만들어요. 같은 크기는 하나로 합치고, 모든 크기를 ZIP에 담아요.
        </p>
      </details>
    </>
  );
}
