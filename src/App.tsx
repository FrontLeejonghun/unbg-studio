import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileImage,
  FolderDown,
  ImagePlus,
  Layers2,
  LoaderCircle,
  LockKeyhole,
  MousePointer2,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { zip } from "fflate";
import { Options } from "@/Options";
import { createDemoFiles, DEMO_SVG } from "@/demo";
import {
  DEFAULT_SETTINGS,
  cleanName,
  colorHex,
  download,
  fileSize,
  getOptions,
  outputNames,
  pairFiles,
} from "@/model";
import type { Asset, Pair, Settings, WorkerResponse, Output } from "@/model";
const DEMO_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEMO_SVG)}`;
const STATUS_MAP = { idle: "변환 대기", processing: "변환 중", done: "완료", error: "확인 필요" };
function dispose(pair: Pair) {
  if (pair.first) URL.revokeObjectURL(pair.first.url);
  if (pair.second) URL.revokeObjectURL(pair.second.url);
  if (pair.output) URL.revokeObjectURL(pair.output.url);
}
export function App() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [previewMode, setPreviewMode] = useState<"result" | "first" | "second">("result");
  const [backdrop, setBackdrop] = useState("checker");
  const [zoom, setZoom] = useState(100);
  const [filter, setFilter] = useState("all");
  const [guide, setGuide] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<{ id: string; slot: "first" | "second" } | null>(null);
  const pairsRef = useRef<Pair[]>([]);
  const runningRef = useRef(false);
  const abortRef = useRef<(() => void) | null>(null);
  const guideRef = useRef<HTMLDialogElement>(null);
  const dragDepth = useRef(0);
  function updatePairs(next: Pair[] | ((old: Pair[]) => Pair[])) {
    const result = typeof next === "function" ? next(pairsRef.current) : next;
    pairsRef.current = result;
    setPairs(result);
  }
  useEffect(
    () => () => {
      runningRef.current = false;
      abortRef.current?.();
      pairsRef.current.forEach(dispose);
    },
    [],
  );
  useEffect(() => {
    if (guide) guideRef.current?.showModal();
    else guideRef.current?.close();
  }, [guide]);
  const active = pairs.find((p) => p.id === activeId) ?? pairs[0];
  const completed = pairs.filter((p) => p.output);
  const selected = pairs.filter((p) => p.selected);
  const selectedDone = selected.filter((p) => p.output);
  const ready = selected.filter((p) => p.first && p.second && p.status !== "done");
  const names = outputNames(pairs, settings.suffix);
  const visible = pairs.filter((p) => filter === "all" || p.status === filter);
  let optionError = "";
  try {
    getOptions(settings);
  } catch (error) {
    optionError = error instanceof Error ? error.message : "옵션을 확인해 주세요.";
  }
  function asset(file: File): Asset {
    return { file, url: URL.createObjectURL(file) };
  }
  function addFiles(files: File[]) {
    if (runningRef.current) return;
    const accepted: File[] = [];
    const errors: string[] = [];
    let size = pairsRef.current.reduce(
      (sum, p) => sum + (p.first?.file.size ?? 0) + (p.second?.file.size ?? 0),
      0,
    );
    let count = pairsRef.current.reduce(
      (sum, p) => sum + Number(Boolean(p.first)) + Number(Boolean(p.second)),
      0,
    );
    for (const file of files) {
      if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
        errors.push(`${file.name}: PNG, JPG, WebP만 지원해요.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        errors.push(`${file.name}: 한 파일은 20 MB까지 가능해요.`);
        continue;
      }
      if (count >= 100 || size + file.size > 300 * 1024 * 1024) {
        errors.push(
          "한 번에 100개 파일, 총 300 MB까지 가능해요. 기존 작업을 내려받고 비워 주세요.",
        );
        break;
      }
      accepted.push(file);
      size += file.size;
      count++;
    }
    const grouped = pairFiles(accepted);
    const remaining = Math.max(0, 50 - pairsRef.current.length);
    if (grouped.length > remaining)
      errors.push("최대 50쌍까지 추가할 수 있어요. 기존 작업을 저장한 뒤 비워 주세요.");
    const additions: Pair[] = grouped.slice(0, remaining).map((p) => ({
      id: crypto.randomUUID(),
      name: p.name,
      first: asset(p.first),
      second: p.second ? asset(p.second) : undefined,
      status: "idle",
      selected: true,
    }));
    updatePairs((old) => [...old, ...additions]);
    if (additions[0]) setActiveId(additions[0].id);
    setPreviewMode("result");
    setMessage(
      errors.length
        ? errors.slice(0, 3).join(" ")
        : additions.length
          ? `${accepted.length}개 파일을 ${additions.length}쌍으로 추가했어요. A와 B가 같은 피사체인지 확인해 주세요.`
          : "",
    );
  }
  async function useDemo() {
    try {
      addFiles(await createDemoFiles());
    } catch {
      setMessage("예제를 불러오지 못했어요. 다시 시도해 주세요.");
    }
  }
  function changeSettings(next: Settings) {
    if (runningRef.current) return;
    const { suffix: previousSuffix, ...previousProcessing } = settings;
    const { suffix: nextSuffix, ...nextProcessing } = next;
    setSettings(next);
    if (
      previousSuffix !== nextSuffix &&
      JSON.stringify(previousProcessing) === JSON.stringify(nextProcessing)
    )
      return;
    updatePairs((old) =>
      old.map((p) => {
        if (p.output) URL.revokeObjectURL(p.output.url);
        return { ...p, output: undefined, status: "idle", error: undefined };
      }),
    );
  }
  function patch(id: string, changes: Partial<Pair>) {
    updatePairs((old) => old.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }
  function removePair(id: string) {
    const pair = pairsRef.current.find((p) => p.id === id);
    if (pair) dispose(pair);
    updatePairs((old) => old.filter((p) => p.id !== id));
  }
  function replaceFile(file: File) {
    const target = replaceTarget.current;
    if (!target || runningRef.current) return;
    const pair = pairsRef.current.find((p) => p.id === target.id);
    if (!pair) return;
    const total =
      pairsRef.current.reduce(
        (sum, p) => sum + (p.first?.file.size ?? 0) + (p.second?.file.size ?? 0),
        0,
      ) -
      (pair[target.slot]?.file.size ?? 0) +
      file.size;
    if (
      !/\.(png|jpe?g|webp)$/i.test(file.name) ||
      file.size > 20 * 1024 * 1024 ||
      total > 300 * 1024 * 1024
    ) {
      setMessage(
        "PNG, JPG, WebP 파일(20 MB 이하)을 선택해 주세요. 전체 용량은 300 MB까지 가능해요.",
      );
      return;
    }
    const prev = pair[target.slot];
    if (prev) URL.revokeObjectURL(prev.url);
    if (pair.output) URL.revokeObjectURL(pair.output.url);
    patch(pair.id, {
      [target.slot]: asset(file),
      output: undefined,
      status: "idle",
      error: undefined,
    });
    setMessage("이미지를 교체했어요. 다시 변환해 주세요.");
  }
  function requestReplace(id: string, slot: "first" | "second") {
    replaceTarget.current = { id, slot };
    replaceRef.current?.click();
  }
  function processPair(pair: Pair): Promise<Output> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./matting.worker.ts", import.meta.url), {
        type: "module",
      });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.terminate();
        abortRef.current = null;
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error("변환 시간이 초과됐어요. 이미지 크기를 줄여 다시 시도해 주세요."));
      }, 120000);
      abortRef.current = () => {
        finish();
        reject(new DOMException("중지됨", "AbortError"));
      };
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        finish();
        if (event.data.ok) resolve(event.data.output);
        else reject(new Error(event.data.error));
      };
      worker.onerror = () => {
        finish();
        reject(new Error("이미지 처리 중 문제가 생겼어요. 최신 브라우저에서 다시 시도해 주세요."));
      };
      worker.postMessage({ first: pair.first?.file, second: pair.second?.file, settings });
    });
  }
  async function convert() {
    if (runningRef.current || optionError || !ready.length) return;
    runningRef.current = true;
    setBusy(true);
    setMessage("");
    setPreviewMode("result");
    let successes = 0;
    let failures = 0;
    try {
      for (const pair of ready) {
        if (!runningRef.current) break;
        patch(pair.id, { status: "processing", error: undefined });
        setActiveId(pair.id);
        try {
          const output = await processPair(pair);
          if (!runningRef.current) break;
          patch(pair.id, {
            status: "done",
            output: { ...output, url: URL.createObjectURL(output.blob) },
          });
          successes++;
        } catch (error) {
          if (!runningRef.current) {
            patch(pair.id, { status: "idle" });
            break;
          }
          patch(pair.id, {
            status: "error",
            error: error instanceof Error ? error.message : "변환 실패",
          });
          failures++;
        }
      }
    } finally {
      const stopped = !runningRef.current;
      runningRef.current = false;
      setBusy(false);
      setMessage(
        `${stopped ? "변환을 중지했어요. " : ""}${successes}쌍 완료${failures ? `, ${failures}쌍은 확인이 필요해요.` : "."} 완료된 결과를 다운로드할 수 있어요.`,
      );
    }
  }
  function stop() {
    runningRef.current = false;
    abortRef.current?.();
  }
  async function downloadZip(targets: Pair[]) {
    if (!targets.length || zipping) return;
    setZipping(true);
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const p of targets) {
        if (p.output)
          entries[names.get(p.id) ?? `${cleanName(p.name)}.png`] = new Uint8Array(
            await p.output.blob.arrayBuffer(),
          );
      }
      const bytes = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) =>
        zip(entries, { level: 0 }, (error, data) =>
          error ? reject(error) : resolve(new Uint8Array(data)),
        ),
      );
      download(new Blob([bytes], { type: "application/zip" }), `unbg-studio-${targets.length}.zip`);
      setMessage(`${targets.length}개 PNG를 ZIP으로 저장했어요.`);
    } catch {
      setMessage("ZIP을 만들지 못했어요. 선택 개수를 줄이거나 개별 다운로드해 주세요.");
    } finally {
      setZipping(false);
    }
  }
  function clearAll() {
    pairsRef.current.forEach(dispose);
    updatePairs([]);
    setActiveId("");
    setMessage("작업 공간을 비웠어요.");
  }
  const previewUrl = active
    ? previewMode === "first"
      ? active.first?.url
      : previewMode === "second"
        ? active.second?.url
        : active.output?.url
    : DEMO_URL;
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="unbg studio 홈">
          <span className="brand-symbol">
            <Layers2 size={22} />
          </span>
          <span>
            unbg<span className="brand-light"> studio</span>
          </span>
          <span className="beta-label">beta</span>
        </a>
        <nav>
          <span className="local-badge">
            <span />내 기기에서 안전하게
          </span>
          <button className="text-button" onClick={() => setGuide(true)}>
            <CircleHelp size={16} />
            사용 가이드
          </button>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div>
            <h1>
              배경 없이,
              <br className="mobile-break" /> 가능성은 그대로.
            </h1>
            <p>
              두 장의 이미지에서 섬세한 투명함을 꺼내세요.
              <br className="mobile-break" /> 여러 쌍도 한 번에.
            </p>
          </div>
          <div className="intro-mark">
            <span className="mini-checker" />
            <span>
              덜어내고.
              <br />
              <strong>더 자유롭게.</strong>
            </span>
          </div>
        </section>
        <div className="workspace">
          <section className="editor">
            <div className="editor-top">
              <div className="workspace-title">
                <Layers2 size={18} />
                <h2>작업 공간</h2>
                <span className="count">{pairs.length}쌍</span>
              </div>
              <button
                className="small-button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Plus size={15} />
                이미지 추가
              </button>
            </div>
            <div className="canvas-toolbar">
              <div className="segmented" aria-label="미리보기 이미지">
                {(["result", "first", "second"] as const).map((mode, i) => (
                  <button
                    key={mode}
                    aria-pressed={previewMode === mode}
                    onClick={() => setPreviewMode(mode)}
                    disabled={!active && mode !== "result"}
                  >
                    {["변환 결과", "원본 A", "원본 B"][i]}
                  </button>
                ))}
              </div>
              <div className="preview-tools">
                <div className="swatches" aria-label="미리보기 배경">
                  {["checker", "white", "dark", "blue"].map((color) => (
                    <button
                      key={color}
                      className={`swatch ${color} ${backdrop === color ? "chosen" : ""}`}
                      aria-label={`${{ checker: "투명 격자", white: "흰색", dark: "검정", blue: "파랑" }[color]} 배경`}
                      aria-pressed={backdrop === color}
                      onClick={() => setBackdrop(color)}
                    />
                  ))}
                </div>
                <select
                  aria-label="미리보기 확대"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                >
                  <option value={50}>50%</option>
                  <option value={100}>맞춤</option>
                  <option value={150}>150%</option>
                  <option value={200}>200%</option>
                </select>
              </div>
            </div>
            <div
              className={`preview-canvas ${backdrop} ${dragging ? "dragging" : ""}`}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current++;
                setDragging(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                e.preventDefault();
                dragDepth.current--;
                if (dragDepth.current === 0) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              {!active && (
                <span className="canvas-caption">
                  <span className="caption-dot" />
                  작은 디테일까지, 그대로
                </span>
              )}
              {previewUrl ? (
                <div className="preview-scroll">
                  <img
                    className={`main-preview ${!active ? "demo-art" : ""}`}
                    src={previewUrl}
                    alt={
                      active
                        ? `${active.name} ${previewMode === "result" ? "변환 결과" : previewMode === "first" ? "원본 A" : "원본 B"}`
                        : "반투명한 파란 꽃 예제"
                    }
                    style={{
                      width: `${zoom * 0.66}%`,
                      maxWidth: zoom === 100 ? 520 : "none",
                      maxHeight: zoom > 100 ? "none" : "100%",
                    }}
                  />
                </div>
              ) : (
                <div className="canvas-empty">
                  {active?.status === "processing" ? (
                    <LoaderCircle className="spin" size={32} />
                  ) : (
                    <Layers2 size={34} />
                  )}
                  <h3>
                    {active?.status === "processing"
                      ? "투명함을 꺼내고 있어요"
                      : active?.error
                        ? "이미지를 확인해 주세요"
                        : !active?.second
                          ? "두 번째 이미지를 추가해 주세요"
                          : "변환 준비가 되었어요"}
                  </h3>
                  <p>{active?.error ?? "아래에서 원본 두 장을 확인하고 변환을 시작하세요."}</p>
                </div>
              )}
              {!active && (
                <>
                  <span className="sample-chip">투명도, 부드러운 경계까지 보존</span>
                  <span className="canvas-bottom-label">실제 변환 가능한 예제</span>
                </>
              )}
              {active?.output && (
                <div className="output-caption">
                  <span>
                    <CheckCircle2 size={14} />
                    {active.output.width} × {active.output.height}
                    <span className="muted">{fileSize(active.output.blob.size)}</span>
                  </span>
                  <button
                    className="small-button"
                    onClick={() =>
                      active.output &&
                      download(active.output.blob, names.get(active.id) ?? "image.png")
                    }
                  >
                    <ArrowDownToLine size={14} />
                    PNG 저장
                  </button>
                </div>
              )}
              {dragging && (
                <div className="drop-overlay">
                  <Upload size={35} />
                  <strong>여기에 이미지를 놓아 주세요</strong>
                  <span>여러 쌍을 한 번에 추가할 수 있어요</span>
                </div>
              )}
            </div>
            {active ? (
              <div className="active-details">
                <label className="output-name">
                  저장할 이름
                  <input
                    aria-label="선택한 쌍 저장 이름"
                    value={active.name}
                    maxLength={120}
                    disabled={busy || zipping}
                    onChange={(e) => patch(active.id, { name: e.target.value })}
                  />
                  <span>.png</span>
                </label>
                <div className="pair-sources">
                  {(["first", "second"] as const).map((slot, index) => (
                    <button
                      key={slot}
                      className="source-slot"
                      disabled={busy}
                      onClick={() => requestReplace(active.id, slot)}
                    >
                      <span className={`slot-letter ${slot}`}>{index === 0 ? "A" : "B"}</span>
                      {active[slot] ? (
                        <img src={active[slot].url} alt="" />
                      ) : (
                        <ImagePlus size={22} />
                      )}
                      <span>
                        <strong>{active[slot]?.file.name ?? "이미지 추가"}</strong>
                        <small>
                          {active[slot]
                            ? `${fileSize(active[slot].file.size)} · 눌러서 교체`
                            : "같은 피사체, 다른 단색 배경"}
                        </small>
                      </span>
                      <Plus size={14} />
                    </button>
                  ))}
                </div>
                {active.output && (
                  <div
                    className={`result-info ${active.output.backgroundDistance < 50 ? "warning" : ""}`}
                  >
                    <span>
                      감지한 배경 <i style={{ background: colorHex(active.output.background1) }} />
                      {colorHex(active.output.background1)}
                      <i style={{ background: colorHex(active.output.background2) }} />
                      {colorHex(active.output.background2)}
                    </span>
                    <span>
                      배경색 거리 {active.output.backgroundDistance.toFixed(1)}
                      {active.output.backgroundDistance < 50 ? " · 더 다른 배경색을 권장해요" : ""}
                    </span>
                    {active.output.cropClippingThreshold !== null && (
                      <span>경계 손실 시작 {active.output.cropClippingThreshold.toFixed(3)}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="upload-start">
                <div className="upload-message">
                  <span className="upload-icon">
                    <ImagePlus size={24} />
                  </span>
                  <div>
                    <h3>이미지들을 놓으면, 준비 끝.</h3>
                    <p>같은 피사체에 배경만 다른 2장씩 준비해 주세요.</p>
                  </div>
                </div>
                <div className="upload-actions">
                  <button className="primary-button" onClick={() => inputRef.current?.click()}>
                    <Plus size={17} />
                    이미지 선택
                  </button>
                  <button className="text-button" onClick={() => void useDemo()}>
                    <Sparkles size={14} />
                    예제로 시작하기
                  </button>
                </div>
                <p className="upload-formats">PNG, JPG, WebP · 파일당 20 MB · 최대 50쌍</p>
              </div>
            )}
            <div className="queue">
              <div className="queue-heading">
                <div className="queue-tabs">
                  <button
                    className={filter === "all" ? "active" : ""}
                    onClick={() => setFilter("all")}
                  >
                    전체 <span>{pairs.length}</span>
                  </button>
                  <button
                    className={filter === "done" ? "active" : ""}
                    onClick={() => setFilter("done")}
                  >
                    완료 <span>{completed.length}</span>
                  </button>
                  <button
                    className={filter === "error" ? "active" : ""}
                    onClick={() => setFilter("error")}
                  >
                    확인 필요 <span>{pairs.filter((p) => p.status === "error").length}</span>
                  </button>
                </div>
                <button
                  className="icon-button"
                  disabled={!pairs.length || busy || zipping}
                  aria-label="작업 전체 비우기"
                  title="작업 전체 비우기"
                  onClick={clearAll}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {pairs.length > 0 ? (
                <>
                  <div className="select-row">
                    <label>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={selected.length === pairs.length}
                        onChange={(e) =>
                          updatePairs((old) =>
                            old.map((p) => ({ ...p, selected: e.target.checked })),
                          )
                        }
                      />
                      전체 선택
                    </label>
                    <span>{selected.length}쌍 선택</span>
                  </div>
                  <div className="pair-list">
                    {visible.map((pair, index) => (
                      <div
                        key={pair.id}
                        className={`pair-row ${active?.id === pair.id ? "active" : ""}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`${pair.name} 선택`}
                          checked={pair.selected}
                          disabled={busy}
                          onChange={(e) => patch(pair.id, { selected: e.target.checked })}
                        />
                        <button
                          className="pair-open"
                          onClick={() => {
                            setActiveId(pair.id);
                            setPreviewMode("result");
                          }}
                        >
                          <span className="pair-index">{String(index + 1).padStart(2, "0")}</span>
                          <span className="pair-thumbnails">
                            {pair.first && <img src={pair.first.url} alt="" />}
                            {pair.second ? <img src={pair.second.url} alt="" /> : <span>?</span>}
                          </span>
                          <span className="pair-title">
                            <strong>{pair.name}</strong>
                            <small>{pair.second ? "이미지 2장" : "두 번째 이미지 필요"}</small>
                          </span>
                          <span className={`status ${pair.status}`}>
                            {pair.status === "processing" ? (
                              <LoaderCircle size={12} className="spin" />
                            ) : pair.status === "done" ? (
                              <Check size={12} />
                            ) : null}
                            {STATUS_MAP[pair.status]}
                          </span>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${pair.name} 삭제`}
                          disabled={busy || zipping}
                          onClick={() => removePair(pair.id)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {!visible.length && (
                    <div className="queue-empty">이 상태의 이미지 쌍이 없어요.</div>
                  )}
                </>
              ) : (
                <div className="queue-empty">
                  <FileImage size={17} />
                  추가한 이미지 쌍이 여기에 표시돼요.
                </div>
              )}
            </div>
            <div className="action-bar">
              <div>
                <strong>
                  {completed.length
                    ? `${completed.length}쌍 완료`
                    : "투명한 다음 장면을 준비하세요"}
                </strong>
                <span>
                  {busy
                    ? "기기에서 순서대로 변환하고 있어요."
                    : "완성된 결과는 원본 해상도의 PNG로 저장해요."}
                </span>
              </div>
              <div className="action-buttons">
                {busy ? (
                  <button className="secondary-button" onClick={stop}>
                    <Square size={13} />
                    중지
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    disabled={!ready.length || Boolean(optionError) || zipping}
                    onClick={() => void convert()}
                  >
                    <Sparkles size={16} />
                    {ready.length ? `${ready.length}쌍 변환하기` : "변환하기"}
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={!selectedDone.length || zipping || busy}
                  onClick={() => void downloadZip(selectedDone)}
                >
                  {zipping ? <LoaderCircle size={16} className="spin" /> : <FolderDown size={16} />}
                  선택 ZIP{selectedDone.length ? ` (${selectedDone.length})` : ""}
                </button>
                {completed.length > 0 && (
                  <button
                    className="icon-button"
                    title="완료한 모든 결과 ZIP 다운로드"
                    aria-label="완료한 모든 결과 ZIP 다운로드"
                    disabled={busy || zipping}
                    onClick={() => void downloadZip(completed)}
                  >
                    <CheckCheck size={19} />
                  </button>
                )}
              </div>
            </div>
          </section>
          <Options
            settings={settings}
            onChange={changeSettings}
            disabled={busy || zipping}
            error={optionError}
          />
        </div>
        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <button className="icon-button" aria-label="알림 닫기" onClick={() => setMessage("")}>
              <X size={15} />
            </button>
          </div>
        )}
        <section className="workflow-guide">
          <div className="guide-title">
            <h2>
              두 장에서 시작하는
              <br />
              깨끗한 투명 배경.
            </h2>
            <button className="text-button" onClick={() => setGuide(true)}>
              처음이라면 가이드 보기
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="guide-step">
            <span>1</span>
            <h3>배경만 다르게 준비</h3>
            <p>
              피사체와 크기는 그대로.
              <br />
              흰색·검정 배경 조합을 추천해요.
            </p>
          </div>
          <div className="guide-step">
            <span>2</span>
            <h3>여러 쌍을 한 번에</h3>
            <p>
              이름의 -white / -black으로 연결해요.
              <br />그 외 파일은 이름순으로 2장씩 묶어요.
            </p>
          </div>
          <div className="guide-step">
            <span>3</span>
            <h3>변환하고, 가져가기</h3>
            <p>
              결과를 확인하고 PNG 또는 ZIP 저장.
              <br />
              파일은 내 기기 밖으로 나가지 않아요.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span className="footer-brand">unbg studio</span>
        <span>
          <ShieldCheck size={14} />
          이미지 전송 없음
        </span>
        <a href="https://github.com/privatenumber/unbg" target="_blank" rel="noreferrer">
          Powered by unbg
          <ArrowRight size={12} />
        </a>
      </footer>
      <input
        className="sr-only"
        ref={inputRef}
        type="file"
        aria-label="여러 이미지 업로드"
        accept=".png,.jpg,.jpeg,.webp"
        multiple
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        className="sr-only"
        ref={replaceRef}
        type="file"
        aria-label="쌍 이미지 교체"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) replaceFile(file);
          e.target.value = "";
        }}
      />
      <dialog
        ref={guideRef}
        className="guide-dialog"
        aria-labelledby="guide-title"
        onCancel={() => setGuide(false)}
        onClose={() => setGuide(false)}
      >
        <div className="dialog-heading">
          <span className="brand-symbol">
            <Layers2 size={21} />
          </span>
          <button className="icon-button" aria-label="가이드 닫기" onClick={() => setGuide(false)}>
            <X size={21} />
          </button>
        </div>
        <h2 id="guide-title">좋은 결과는, 잘 맞는 두 장에서.</h2>
        <p>
          unbg는 서로 다른 단색 배경 위의 같은 피사체를 비교해서 투명도를 복원해요. 한 장의
          사진만으로는 변환할 수 없어요.
        </p>
        <div className="guide-example">
          <div style={{ background: "#fff" }}>
            <img src={DEMO_URL} alt="흰색 배경 예제" />
            <span>원본 A</span>
          </div>
          <Plus size={19} />
          <div style={{ background: "#252735" }}>
            <img src={DEMO_URL} alt="검정 배경 예제" />
            <span>원본 B</span>
          </div>
          <ArrowRight size={19} />
          <div className="checker">
            <img src={DEMO_URL} alt="투명 배경 결과" />
            <span>투명 PNG</span>
          </div>
        </div>
        <ul>
          <li>
            <MousePointer2 size={17} />
            <span>피사체 위치·크기·조명은 같게, 배경색만 바꿔 주세요.</span>
          </li>
          <li>
            <Layers2 size={17} />
            <span>
              flower-white.png + flower-black.png처럼 이름을 맞추면 자동으로 연결돼요. 연결 후 A/B
              이미지를 눌러 교체할 수도 있어요.
            </span>
          </li>
          <li>
            <FileImage size={17} />
            <span>
              무손실 PNG가 가장 깨끗해요. JPG·WebP 압축 흔적은 결과에 남을 수 있어요. 투명 원본과
              움직이는 WebP는 지원하지 않아요.
            </span>
          </li>
          <li>
            <LockKeyhole size={17} />
            <span>
              변환과 다운로드는 브라우저 안에서만 이루어져요. 새로고침하면 작업은 사라지니 결과를
              먼저 저장해 주세요.
            </span>
          </li>
        </ul>
        <button
          className="primary-button"
          onClick={() => {
            setGuide(false);
            void useDemo();
          }}
        >
          <Sparkles size={16} />
          예제로 직접 해보기
        </button>
      </dialog>
    </div>
  );
}
