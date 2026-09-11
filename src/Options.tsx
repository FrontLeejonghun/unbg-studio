import { RotateCcw, SlidersHorizontal, ChevronDown } from "lucide-react";
import { DEFAULT_SETTINGS, parseColor, colorHex } from "@/model";
import type { Settings } from "@/model";
function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="range-field">
      <span className="field-heading">
        {label}
        <input
          aria-label={`${label} 값`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
      <input
        type="range"
        aria-label={`${label} 슬라이더`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small>{hint}</small>
    </div>
  );
}
function ColorField({
  index,
  value,
  onChange,
}: {
  index: number;
  value: string;
  onChange: (value: string) => void;
}) {
  let swatch = index === 1 ? "#ffffff" : "#000000";
  try {
    const color = parseColor(value);
    if (color) swatch = colorHex(color);
  } catch {
    /* The parent reports invalid color text before conversion. */
  }
  return (
    <div className="color-field">
      <div className="field-heading">
        <label htmlFor={`background-${index}`}>배경 {index === 1 ? "A" : "B"}</label>
        <button
          className={`auto-toggle ${!value ? "active" : ""}`}
          onClick={() => onChange(value ? "" : swatch)}
        >
          {!value ? "자동 감지" : "직접 지정"}
        </button>
      </div>
      <div className="color-input">
        <input
          type="color"
          aria-label={`배경 ${index === 1 ? "A" : "B"} 색상 선택`}
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={`background-${index}`}
          placeholder="자동 감지"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
export function Options({
  settings,
  onChange,
  disabled,
  error,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  disabled: boolean;
  error: string;
}) {
  const removesBackground = settings.mode !== "convert";
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    onChange({ ...settings, [key]: value });
  }
  return (
    <aside className="options">
      <div className="panel-heading">
        <h2>
          <SlidersHorizontal size={17} />
          변환 옵션
        </h2>
        <button
          className="icon-button"
          title="옵션 초기화"
          aria-label="옵션 초기화"
          disabled={disabled}
          onClick={() => onChange({ ...DEFAULT_SETTINGS, mode: settings.mode })}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <fieldset disabled={disabled} className="options-fields">
        <div className="option-section">
          <h3>저장 형식</h3>
          <div className="select-wrap">
            <select
              aria-label="저장 형식"
              value={settings.format}
              onChange={(event) => update("format", event.target.value as Settings["format"])}
            >
              <option value="png">PNG · 무손실</option>
              <option value="webp">WebP · 무손실</option>
              <option value="jpg" disabled={removesBackground}>
                JPG · 손실 압축{removesBackground ? " (배경 보존 전용)" : ""}
              </option>
            </select>
            <ChevronDown size={15} />
          </div>
          {settings.format === "jpg" ? (
            <>
              <RangeField
                label="JPG 품질"
                hint="높을수록 선명하지만 파일 크기가 커져요."
                value={settings.jpegQuality}
                min={1}
                max={100}
                step={1}
                onChange={(value) => update("jpegQuality", value)}
              />
              <p className="section-help">
                JPG는 무손실이 아니에요. 투명 영역은 흰색으로 저장해요. JPG 원본은 재압축하지
                않아요.
              </p>
            </>
          ) : (
            <p className="section-help">
              8-bit 픽셀 기준 무손실. 크기와 투명도를 유지해요. 색상 프로필·메타데이터는 형식 변환
              시 보존하지 않아요.
            </p>
          )}
        </div>
        {settings.mode === "ai" && (
          <div className="option-section model-note">
            <h3>무료 자동 배경 제거</h3>
            <p className="section-help">
              BRIA RMBG 1.4가 내 기기에서 처리해요. 첫 실행에는 모델 약 42 MB를 다운로드해요.
            </p>
            <p className="input-hint">개인·비상업용 무료 · 토큰·API 키 불필요</p>
          </div>
        )}
        {settings.mode === "pair" && (
          <div className="option-section">
            <h3>배경색</h3>
            <p className="section-help">기본값은 이미지 네 모서리에서 감지해요.</p>
            <div className="color-grid">
              <ColorField
                index={1}
                value={settings.background1}
                onChange={(v) => update("background1", v)}
              />
              <ColorField
                index={2}
                value={settings.background2}
                onChange={(v) => update("background2", v)}
              />
            </div>
            <p className="input-hint">HEX 또는 RGB 입력 가능</p>
          </div>
        )}
        {removesBackground && (
          <div className="option-section">
            <h3>투명 영역 자르기</h3>
            <div className="select-wrap">
              <select
                aria-label="투명 영역 자르기"
                value={settings.cropMode}
                onChange={(e) => update("cropMode", e.target.value as Settings["cropMode"])}
              >
                <option value="off">원본 크기 유지</option>
                <option value="auto">자동으로 여백 자르기</option>
                <option value="threshold">투명도 기준으로 자르기</option>
              </select>
              <ChevronDown size={15} />
            </div>
            {settings.cropMode === "threshold" && (
              <RangeField
                label="자르기 기준"
                hint="이 값 이하인 픽셀은 여백 계산에서 제외해요."
                value={settings.cropThreshold}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => update("cropThreshold", v)}
              />
            )}
            <p className="section-help">잘린 영역 안의 픽셀과 투명도는 그대로예요.</p>
          </div>
        )}
        {removesBackground && (
          <details className="option-section advanced" open>
            <summary>
              세부 조정
              <ChevronDown size={15} />
            </summary>
            {settings.mode === "pair" && (
              <RangeField
                label="채널 임계값"
                hint="두 배경의 색 차이를 구분하는 최소값이에요."
                value={settings.channelThreshold}
                min={0}
                max={255}
                step={1}
                onChange={(v) => update("channelThreshold", v)}
              />
            )}
            <RangeField
              label="투명도 하한"
              hint="이 값 이하를 완전히 투명하게 만들어요."
              value={settings.floor}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => update("floor", v)}
            />
            <RangeField
              label="투명도 상한"
              hint="이 값 이상을 완전히 불투명하게 만들어요."
              value={settings.ceiling}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => update("ceiling", v)}
            />
          </details>
        )}
        <div className="option-section">
          <label className="field-heading" htmlFor="suffix">
            저장할 파일명 접미사<span className="format-tag">{settings.format.toUpperCase()}</span>
          </label>
          <input
            id="suffix"
            className="text-input"
            value={settings.suffix}
            maxLength={50}
            onChange={(e) => update("suffix", e.target.value)}
          />
          <p className="section-help">같은 이름은 번호를 붙여 따로 저장해요.</p>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="option-error">
          {error}
        </p>
      )}
      <div className="option-note">
        옵션은 모든 작업에 적용돼요.
        <br />
        바꾸면 다시 변환해 주세요.
      </div>
    </aside>
  );
}
