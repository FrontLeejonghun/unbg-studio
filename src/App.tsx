import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  Keyboard,
  Columns2,
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
import { ImagePreview } from "@/ImagePreview";
import { Shortcuts, isEditing } from "@/Shortcuts";
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
  exportFiles,
  pairFiles,
} from "@/model";
import type { Asset, Pair, Settings, WorkerResponse, Output, ProcessingProgress } from "@/model";
const DEMO_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEMO_SVG)}`;
const STATUS_MAP = { idle: "변환 대기", processing: "변환 중", done: "완료", error: "확인 필요" };
function disposeOutput(output: Pair["output"]) {
  if (!output) return;
  URL.revokeObjectURL(output.url);
  output.variants?.forEach((variant) => URL.revokeObjectURL(variant.url));
}
function dispose(pair: Pair) {
  if (pair.first) URL.revokeObjectURL(pair.first.url);
  if (pair.second) URL.revokeObjectURL(pair.second.url);
  disposeOutput(pair.output);
}
export function App() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [activeId, setActiveId] = useState("");
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const demoPendingRef = useRef(false);
  const [zipping, setZipping] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [previewMode, setPreviewMode] = useState<"result" | "first" | "second" | "compare">(
    "result",
  );
  const [backdrop, setBackdrop] = useState("checker");
  const [zoom, setZoom] = useState(0);
  const [shortcuts, setShortcuts] = useState(false);
  const [pasting, setPasting] = useState(false);
  const pasteVersion = useRef(0);
  const pastePending = useRef(false);
  const [variantIndex, setVariantIndex] = useState(0);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | undefined>();
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
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
      pasteVersion.current++;
      runningRef.current = false;
      abortRef.current?.();
      workerRef.current?.terminate();
      pairsRef.current.forEach(dispose);
    },
    [],
  );
  useEffect(() => {
    if (guide) guideRef.current?.showModal();
    else guideRef.current?.close();
  }, [guide]);
  const active = pairs.find((p) => p.id === activeId) ?? pairs[0];
  const activeOutput = active?.output?.variants?.[variantIndex] ?? active?.output;
  const allExportFiles = exportFiles(pairs, settings.suffix, settings.format);
  const activeExport = allExportFiles.find(
    (entry) => entry.pairId === active?.id && entry.url === activeOutput?.url,
  );
  const completed = pairs.filter((p) => p.output);
  const selected = pairs.filter((p) => p.selected);
  const selectedDone = selected.filter((p) => p.output);
  const selectedIds = new Set(selectedDone.map((pair) => pair.id));
  const selectedOutputCount = allExportFiles.filter((file) => selectedIds.has(file.pairId)).length;
  const isSingle = settings.mode !== "pair";
  const removesBackground = settings.mode !== "convert";
  const formatLabel = settings.format === "webp" ? "WebP" : settings.format.toUpperCase();
  const unit = isSingle ? "장" : "쌍";
  const ready = selected.filter((p) => p.first && (isSingle || p.second) && p.status !== "done");
  const names = outputNames(pairs, settings.suffix, settings.format);
  const visible = pairs.filter((p) => filter === "all" || p.status === filter);
  let optionError = "";
  try {
    getOptions(settings);
  } catch (error) {
    optionError = error instanceof Error ? error.message : "옵션을 확인해 주세요.";
  }
  useEffect(() => {
    setVariantIndex(0);
    setSourceSize(undefined);
    if (!active?.first?.url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = active.first.url;
    return () => {
      cancelled = true;
    };
  }, [active?.id, active?.first?.url]);
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (isEditing(event.target) || guide || shortcuts) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      if (busy || zipping) {
        setMessage("진행 중인 작업이 끝나면 이미지를 붙여넣어 주세요.");
        return;
      }
      addFiles(files);
    }
    function keyboard(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        isEditing(event.target) ||
        guide ||
        shortcuts
      )
        return;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && !event.altKey) {
        if (key === "o" && !busy && !zipping) {
          event.preventDefault();
          inputRef.current?.click();
        } else if (key === "enter" && !busy && !zipping) {
          event.preventDefault();
          void convert();
        } else if (key === "s" && event.shiftKey && !busy && !zipping && selectedDone.length) {
          event.preventDefault();
          void downloadZip(selectedDone);
        }
        return;
      }
      if (event.altKey) return;
      if (key === "?") {
        event.preventDefault();
        setShortcuts(true);
      } else if (key === "escape" && busy) {
        event.preventDefault();
        stop();
      } else if (key === "b" && active?.output) {
        event.preventDefault();
        setPreviewMode((mode) => (mode === "compare" ? "result" : "compare"));
      } else if (key === "0") setZoom(0);
      else if (key === "1") setZoom(100);
      else if ((key === "arrowleft" || key === "arrowright") && visible.length) {
        if (event.target instanceof HTMLElement && event.target.closest("button, summary, a"))
          return;
        event.preventDefault();
        const index = visible.findIndex((pair) => pair.id === active?.id);
        setActiveId(
          visible[
            Math.max(0, Math.min(visible.length - 1, index + (key === "arrowright" ? 1 : -1)))
          ].id,
        );
      }
    }
    window.addEventListener("paste", paste);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("paste", paste);
      window.removeEventListener("keydown", keyboard);
    };
  });
  async function pasteClipboard() {
    if (runningRef.current || zipping || pastePending.current) return;
    if (!navigator.clipboard?.read) {
      setMessage(`이미지를 복사한 뒤 ${modifier}+V로 붙여넣어 주세요.`);
      return;
    }
    pastePending.current = true;
    setPasting(true);
    const version = pasteVersion.current;
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((value) =>
          ["image/png", "image/jpeg", "image/webp"].includes(value),
        );
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(
          new File(
            [blob],
            `clipboard-${Date.now()}-${files.length + 1}.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`,
            { type },
          ),
        );
      }
      if (version !== pasteVersion.current || runningRef.current) return;
      if (files.length) addFiles(files);
      else setMessage("클립보드에 이미지가 없어요. 이미지 자체를 복사한 뒤 다시 붙여넣어 주세요.");
    } catch {
      setMessage(
        `클립보드를 읽지 못했어요. 이미지를 복사한 뒤 이 화면에서 ${modifier}+V로 붙여넣어 주세요.`,
      );
    } finally {
      pastePending.current = false;
      setPasting(false);
    }
  }
  function asset(file: File): Asset {
    return { file, url: URL.createObjectURL(file) };
  }
  function addFiles(files: File[]) {
    if (runningRef.current || zipping) return;
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
    const grouped = isSingle
      ? accepted.map((first) => ({ name: cleanName(first.name), first, second: undefined }))
      : pairFiles(accepted);
    const remaining = Math.max(0, 50 - pairsRef.current.length);
    if (grouped.length > remaining)
      errors.push(`최대 50${unit}까지 추가할 수 있어요. 기존 작업을 저장한 뒤 비워 주세요.`);
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
          ? isSingle
            ? `${additions.length}장을 추가했어요. ${removesBackground ? "변환하기를 누르면 자동으로 배경을 제거해요." : "배경은 유지하고 선택한 형식으로 저장해요."}`
            : `${accepted.length}개 파일을 ${additions.length}쌍으로 추가했어요. A와 B가 같은 피사체인지 확인해 주세요.`
          : "",
    );
  }
  async function useDemo() {
    if (runningRef.current || demoPendingRef.current) return;
    demoPendingRef.current = true;
    setDemoLoading(true);
    try {
      addFiles(await createDemoFiles(isSingle));
    } catch {
      setMessage("예제를 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      demoPendingRef.current = false;
      setDemoLoading(false);
    }
  }
  function changeSettings(next: Settings) {
    if (runningRef.current || zipping || JSON.stringify(next) === JSON.stringify(settings)) return;
    const { suffix: previousSuffix, ...previousProcessing } = settings;
    const { suffix: nextSuffix, ...nextProcessing } = next;
    if (next.mode !== settings.mode) {
      pasteVersion.current++;
      if (
        demoPendingRef.current ||
        (pairsRef.current.length && (next.mode === "pair" || settings.mode === "pair"))
      )
        return;
      setPreviewMode("result");
      workerRef.current?.terminate();
      workerRef.current = null;
    }
    setSettings(next);
    setVariantIndex(0);
    if (
      previousSuffix !== nextSuffix &&
      JSON.stringify(previousProcessing) === JSON.stringify(nextProcessing)
    )
      return;
    setMessage(pairsRef.current.length ? "옵션이 바뀌었어요. 다시 변환해 주세요." : "");
    updatePairs((old) =>
      old.map((p) => {
        disposeOutput(p.output);
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
    disposeOutput(pair.output);
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
      const worker =
        workerRef.current ??
        new Worker(new URL("./matting.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      setProgress({ message: "이미지를 준비하고 있어요." });
      let finished = false;
      const finish = (terminate = false) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        if (terminate) {
          worker.terminate();
          workerRef.current = null;
        }
        abortRef.current = null;
        setProgress(null);
      };
      const timer = setTimeout(
        () => {
          finish(true);
          reject(
            new Error(
              "처리 시간이 초과됐어요. 인터넷 연결을 확인하거나 이미지 크기를 줄여 다시 시도해 주세요.",
            ),
          );
        },
        settings.mode === "ai" ? 600000 : 120000,
      );
      abortRef.current = () => {
        finish(true);
        reject(new DOMException("중지됨", "AbortError"));
      };
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === "progress") {
          setProgress(event.data.progress);
          return;
        }
        finish(!event.data.ok);
        if (event.data.ok) resolve(event.data.output);
        else reject(new Error(event.data.error));
      };
      worker.onerror = () => {
        finish(true);
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
            output: {
              ...output,
              url: URL.createObjectURL(output.blob),
              variants: output.variants?.map((variant) => ({
                ...variant,
                url: URL.createObjectURL(variant.blob),
              })),
            },
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
        `${stopped ? "변환을 중지했어요. " : ""}${successes}${unit} 완료${failures ? `, ${failures}${unit}은 확인이 필요해요.` : "."} ${pairsRef.current.some((pair) => pair.output) ? "완료된 결과를 다운로드할 수 있어요." : "이미지 안내를 확인한 뒤 다시 시도해 주세요."}`,
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
      const targetIds = new Set(targets.map((pair) => pair.id));
      const files = allExportFiles.filter((file) => targetIds.has(file.pairId));
      for (const file of files) entries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
      const bytes = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) =>
        zip(entries, { level: 0 }, (error, data) =>
          error ? reject(error) : resolve(new Uint8Array(data)),
        ),
      );
      download(new Blob([bytes], { type: "application/zip" }), `unbg-studio-${targets.length}.zip`);
      setMessage(`${files.length}개 ${formatLabel} 파일을 ZIP으로 저장했어요.`);
    } catch {
      setMessage("ZIP을 만들지 못했어요. 선택 개수를 줄이거나 개별 다운로드해 주세요.");
    } finally {
      setZipping(false);
    }
  }
  function clearAll() {
    pasteVersion.current++;
    workerRef.current?.terminate();
    workerRef.current = null;
    setProgress(null);
    pairsRef.current.forEach(dispose);
    updatePairs([]);
    setActiveId("");
    setFilter("all");
    setMessage("작업 공간을 비웠어요.");
  }
  const previewUrl = active
    ? previewMode === "first"
      ? active.first?.url
      : previewMode === "second"
        ? active.second?.url
        : (activeOutput?.url ?? (active.status === "idle" ? active.first?.url : undefined))
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
          <button
            className="text-button shortcut-trigger"
            aria-label="단축키 안내"
            title="단축키 안내 (?)"
            data-tip="단축키 보기  ?"
            onClick={() => setShortcuts(true)}
          >
            <Keyboard size={16} />
            단축키<kbd>?</kbd>
          </button>
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
              원하는 형식으로,
              <br className="mobile-break" /> 이미지 그대로.
            </h1>
            <p>
              형식, 용량, 크기까지 한 번에 정리해요.
              <br className="mobile-break" /> 여러 장도 한 번에. 무료로, 내 브라우저에서.
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
        <div className="mode-bar">
          <label className="background-toggle">
            <input
              type="checkbox"
              role="switch"
              aria-label="배경 제거"
              checked={removesBackground}
              disabled={busy || zipping || demoLoading || (!isSingle && pairs.length > 0)}
              onChange={(event) =>
                changeSettings({
                  ...settings,
                  mode: event.target.checked ? "ai" : "convert",
                  compression:
                    event.target.checked &&
                    settings.format === "jpg" &&
                    settings.compression === "lossy"
                      ? "lossless"
                      : settings.compression,
                  format:
                    event.target.checked && settings.format === "jpg" ? "png" : settings.format,
                })
              }
            />
            <span>배경 제거</span>
            <strong>{removesBackground ? "켜짐" : "꺼짐"}</strong>
          </label>
          {removesBackground && (
            <div className="segmented" aria-label="배경 제거 방식">
              <button
                aria-pressed={isSingle}
                disabled={busy || zipping || demoLoading || pairs.length > 0}
                onClick={() => changeSettings({ ...settings, mode: "ai" })}
              >
                한 장 자동 제거
              </button>
              <button
                aria-pressed={!isSingle}
                disabled={busy || zipping || demoLoading || pairs.length > 0}
                onClick={() => changeSettings({ ...settings, mode: "pair" })}
              >
                두 장 비교 · unbg
              </button>
            </div>
          )}
          <span>
            {!removesBackground
              ? "배경은 그대로. 필요한 압축과 크기만 선택하세요."
              : !isSingle && pairs.length
                ? "배경 제거 방식을 바꾸려면 작업 공간을 비워 주세요."
                : "내 기기에서 처리 · 토큰·API 키 불필요"}
          </span>
        </div>
        <div className="workspace">
          <section className="editor">
            <div className="editor-top">
              <div className="workspace-title">
                <Layers2 size={18} />
                <h2>작업 공간</h2>
                <span className="count">
                  {pairs.length}
                  {unit}
                </span>
              </div>
              <div className="intake-actions">
                <button
                  className="small-button"
                  disabled={busy || zipping || pasting}
                  aria-label="이미지 붙여넣기"
                  title={`이미지 붙여넣기 (${modifier}+V)`}
                  data-tip={`이미지 붙여넣기  ${modifier} V`}
                  onClick={() => void pasteClipboard()}
                >
                  {pasting ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <ClipboardPaste size={15} />
                  )}
                  붙여넣기
                </button>
                <button
                  className="small-button"
                  disabled={busy || zipping}
                  title={`이미지 추가 (${modifier}+O)`}
                  onClick={() => inputRef.current?.click()}
                >
                  <Plus size={15} />
                  이미지 추가
                </button>
              </div>
            </div>
            <div className="canvas-toolbar">
              <div className="segmented" aria-label="미리보기 이미지">
                {(isSingle
                  ? (["result", "first"] as const)
                  : (["result", "first", "second"] as const)
                ).map((mode, i) => (
                  <button
                    key={mode}
                    aria-pressed={previewMode === mode}
                    onClick={() => setPreviewMode(mode)}
                    disabled={!active && mode !== "result"}
                  >
                    {["변환 결과", isSingle ? "원본" : "원본 A", "원본 B"][i]}
                  </button>
                ))}
                <button
                  aria-pressed={previewMode === "compare"}
                  disabled={!active?.output}
                  title="원본·결과 비교 (B)"
                  onClick={() => setPreviewMode("compare")}
                >
                  <Columns2 size={13} />
                  비교
                </button>
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
                  <option value={0}>맞춤</option>
                  <option value={100}>100% · 실제 크기</option>
                  <option value={150}>150%</option>
                  <option value={200}>200%</option>
                </select>
              </div>
            </div>
            {active?.output?.variants && active.output.variants.length > 1 && (
              <div className="variant-strip" aria-label="결과 크기 선택">
                {active.output.variants.map((variant, index) => (
                  <button
                    key={variant.url}
                    aria-pressed={index === variantIndex}
                    onClick={() => setVariantIndex(index)}
                  >
                    {variant.width} × {variant.height}
                    <span>{fileSize(variant.blob.size)}</span>
                  </button>
                ))}
              </div>
            )}
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
              {active?.status === "idle" && !active.output && (
                <span className="canvas-caption">원본 · 변환 전</span>
              )}
              {!active && (
                <span className="canvas-caption">
                  <span className="caption-dot" />
                  작은 디테일까지, 그대로
                </span>
              )}
              {activeOutput &&
              active?.first &&
              (previewMode === "result" || previewMode === "compare") ? (
                <ImagePreview
                  original={active.first.url}
                  result={activeOutput.url}
                  width={activeOutput.width}
                  height={activeOutput.height}
                  compare={previewMode === "compare"}
                  zoom={zoom}
                  alt={active.name}
                />
              ) : active && previewUrl && sourceSize ? (
                <ImagePreview
                  original={previewUrl}
                  result={previewUrl}
                  width={sourceSize.width}
                  height={sourceSize.height}
                  compare={false}
                  zoom={zoom}
                  alt={active.name}
                  resultLabel={previewMode === "second" ? "원본 B" : "원본"}
                />
              ) : previewUrl ? (
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
                      width:
                        zoom === 0
                          ? "66%"
                          : sourceSize
                            ? (sourceSize.width * zoom) / 100
                            : `${zoom * 0.66}%`,
                      maxWidth: zoom === 0 ? 520 : "none",
                      maxHeight: zoom === 0 ? "100%" : "none",
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
                      ? removesBackground
                        ? "배경을 제거하고 있어요"
                        : "이미지 형식을 바꾸고 있어요"
                      : active?.error
                        ? "이미지를 확인해 주세요"
                        : !isSingle && !active?.second
                          ? "두 번째 이미지를 추가해 주세요"
                          : "변환 준비가 되었어요"}
                  </h3>
                  <p role={active?.status === "processing" ? "status" : undefined}>
                    {active?.error ??
                      (active?.status === "processing"
                        ? progress?.message
                        : isSingle
                          ? removesBackground
                            ? "변환하기를 누르면 이 이미지의 배경을 자동으로 제거해요."
                            : `${formatLabel}로 저장할 준비가 되었어요. 오른쪽에서 크기와 압축을 조절하세요.`
                          : "아래에서 원본 두 장을 확인하고 변환을 시작하세요.")}
                  </p>
                  {active?.status === "processing" && progress?.percent !== undefined && (
                    <progress
                      aria-label="모델 다운로드 진행률"
                      value={progress.percent}
                      max={100}
                    />
                  )}
                  {active?.status === "processing" && settings.mode === "ai" && (
                    <small>이미지는 전송되지 않아요. 이 화면을 열어 두세요.</small>
                  )}
                </div>
              )}
              {!active && (
                <>
                  <span className="sample-chip">
                    {isSingle
                      ? removesBackground
                        ? "한 장으로 간편하게, 투명 이미지"
                        : "이미지는 그대로, 형식은 자유롭게"
                      : "투명도, 부드러운 경계까지 보존"}
                  </span>
                  <span className="canvas-bottom-label">
                    {isSingle
                      ? "완성 이미지 예시 · 아래에서 직접 변환해 보세요"
                      : "실제 변환 가능한 예제"}
                  </span>
                </>
              )}
              {activeOutput && (
                <div className="output-caption">
                  <span>
                    <CheckCircle2 size={14} />
                    {activeOutput.width} × {activeOutput.height}
                    <span className="muted">{fileSize(activeOutput.blob.size)}</span>
                  </span>
                  <button
                    className="small-button"
                    onClick={() =>
                      activeOutput &&
                      download(
                        activeOutput.blob,
                        activeExport?.name ?? names.get(active.id) ?? `image.${settings.format}`,
                      )
                    }
                  >
                    <ArrowDownToLine size={14} />
                    {formatLabel} 저장
                  </button>
                </div>
              )}
              {dragging && (
                <div className="drop-overlay">
                  <Upload size={35} />
                  <strong>여기에 이미지를 놓아 주세요</strong>
                  <span>여러 이미지를 한 번에 추가할 수 있어요</span>
                </div>
              )}
            </div>
            {activeOutput && active?.first && (
              <div className="savings-strip">
                <span>
                  원본 <strong>{fileSize(active.first.file.size)}</strong>
                </span>
                <ArrowRight size={14} />
                <span>
                  결과 <strong>{fileSize(activeOutput.blob.size)}</strong>
                </span>
                <strong
                  className={
                    activeOutput.blob.size < active.first.file.size
                      ? "saving-positive"
                      : "saving-neutral"
                  }
                >
                  {activeOutput.blob.size === active.first.file.size
                    ? "용량 동일"
                    : `${Math.abs((1 - activeOutput.blob.size / active.first.file.size) * 100).toFixed(1)}% ${activeOutput.blob.size < active.first.file.size ? "감소" : "증가"}`}
                </strong>
                {previewMode === "compare" && (
                  <small>
                    결과 크기에 맞춰 비교
                    {settings.cropMode !== "off" && removesBackground
                      ? " · 잘린 영역은 구도가 달라요"
                      : ""}
                  </small>
                )}
              </div>
            )}
            {active ? (
              <div className="active-details">
                <label className="output-name">
                  저장할 이름
                  <input
                    aria-label="선택한 이미지 저장 이름"
                    value={active.name}
                    maxLength={120}
                    disabled={busy || zipping}
                    onChange={(e) => patch(active.id, { name: e.target.value })}
                  />
                  <span>.{settings.format}</span>
                </label>
                <div className={`pair-sources ${isSingle ? "single-source" : ""}`}>
                  {(isSingle ? (["first"] as const) : (["first", "second"] as const)).map(
                    (slot, index) => (
                      <button
                        key={slot}
                        className="source-slot"
                        disabled={busy || zipping}
                        onClick={() => requestReplace(active.id, slot)}
                      >
                        <span className={`slot-letter ${slot}`}>
                          {isSingle ? "1" : index === 0 ? "A" : "B"}
                        </span>
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
                    ),
                  )}
                </div>
                {active.output?.engine && (
                  <div className="result-info">
                    <span>
                      {active.output.engine} · {(active.output.durationMs / 1000).toFixed(1)}초 · 내
                      기기에서 처리 완료
                    </span>
                    {removesBackground && (
                      <span>사진에 따라 미세한 경계나 반투명 부분은 다를 수 있어요.</span>
                    )}
                  </div>
                )}
                {active.output &&
                  active.output.background1 &&
                  active.output.background2 &&
                  active.output.backgroundDistance !== undefined && (
                    <div
                      className={`result-info ${active.output.backgroundDistance < 50 ? "warning" : ""}`}
                    >
                      <span>
                        감지한 배경{" "}
                        <i style={{ background: colorHex(active.output.background1) }} />
                        {colorHex(active.output.background1)}
                        <i style={{ background: colorHex(active.output.background2) }} />
                        {colorHex(active.output.background2)}
                      </span>
                      <span>
                        배경색 거리 {active.output.backgroundDistance.toFixed(1)}
                        {active.output.backgroundDistance < 50
                          ? " · 더 다른 배경색을 권장해요"
                          : ""}
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
                    <p>
                      {isSingle
                        ? "사진 한 장도, 여러 장도 그대로 올려 주세요."
                        : "같은 피사체에 배경만 다른 2장씩 준비해 주세요."}
                    </p>
                  </div>
                </div>
                <div className="upload-actions">
                  <button className="primary-button" onClick={() => inputRef.current?.click()}>
                    <Plus size={17} />
                    이미지 선택
                  </button>
                  <button
                    className="text-button"
                    disabled={demoLoading}
                    onClick={() => void useDemo()}
                  >
                    <Sparkles size={14} />
                    예제로 시작하기
                  </button>
                </div>
                <p className="upload-formats">
                  PNG, JPG, WebP · 파일당 20 MB · 최대 50{unit} · {modifier}+V로 붙여넣기
                </p>
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
                    <span>
                      {selected.length}
                      {unit} 선택
                    </span>
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
                            {!isSingle &&
                              (pair.second ? <img src={pair.second.url} alt="" /> : <span>?</span>)}
                          </span>
                          <span className="pair-title">
                            <strong>{pair.name}</strong>
                            <small>
                              {isSingle
                                ? removesBackground
                                  ? "한 장 자동 제거"
                                  : "형식·용량·크기 변환"
                                : pair.second
                                  ? "이미지 2장"
                                  : "두 번째 이미지 필요"}
                            </small>
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
                  {!visible.length && <div className="queue-empty">이 상태의 이미지가 없어요.</div>}
                </>
              ) : (
                <div className="queue-empty">
                  <FileImage size={17} />
                  추가한 이미지가 여기에 표시돼요.
                </div>
              )}
            </div>
            <div className="action-bar">
              <div>
                <strong>
                  {completed.length
                    ? `${completed.length}${unit} 완료 · ${allExportFiles.length}개 결과`
                    : "다음 작업을 가볍게 준비하세요"}
                </strong>
                <span>
                  {busy
                    ? (progress?.message ?? "기기에서 순서대로 변환하고 있어요.")
                    : `완성된 결과는 ${formatLabel}로 저장해요.${!removesBackground ? " 배경 제거 꺼짐" : ""}`}
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
                    aria-label={ready.length ? `${ready.length}${unit} 변환하기` : "변환하기"}
                    title={`선택 이미지 변환 (${modifier}+Enter)`}
                    data-tip={`${modifier} Enter`}
                    onClick={() => void convert()}
                  >
                    <Sparkles size={16} />
                    {ready.length ? `${ready.length}${unit} 변환하기` : "변환하기"}
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={!selectedDone.length || zipping || busy}
                  title={`모든 크기를 ZIP으로 저장 (${modifier}+Shift+S)`}
                  onClick={() => void downloadZip(selectedDone)}
                >
                  {zipping ? <LoaderCircle size={16} className="spin" /> : <FolderDown size={16} />}
                  선택 ZIP{selectedOutputCount ? ` (${selectedOutputCount}개)` : ""}
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
            onMessage={setMessage}
            sourceSize={sourceSize}
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
              가볍게 시작하는
              <br />
              편리한 이미지 변환.
            </h2>
            <button className="text-button" onClick={() => setGuide(true)}>
              처음이라면 가이드 보기
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="guide-step">
            <span>1</span>
            <h3>{isSingle ? "사진을 그대로 올리기" : "배경만 다르게 준비"}</h3>
            <p>
              {isSingle ? "PNG, JPG, WebP를 한 번에." : "피사체와 크기는 그대로."}
              <br />
              {isSingle
                ? "붙여넣기와 여러 장 업로드를 지원해요."
                : "흰색·검정 배경 조합을 추천해요."}
            </p>
          </div>
          <div className="guide-step">
            <span>2</span>
            <h3>
              {isSingle
                ? removesBackground
                  ? "브라우저에서 자동 제거"
                  : "원하는 형식 선택"
                : "여러 쌍을 한 번에"}
            </h3>
            <p>
              {isSingle
                ? removesBackground
                  ? "첫 실행에 무료 모델을 내려받아요."
                  : "압축·크기를 정하거나 프리셋을 골라요."
                : "이름의 -white / -black으로 연결해요."}
              <br />
              {isSingle
                ? removesBackground
                  ? "이후에는 저장된 모델을 재사용해요."
                  : "필요할 때만 배경 제거를 켜세요."
                : "그 외 파일은 이름순으로 2장씩 묶어요."}
            </p>
          </div>
          <div className="guide-step">
            <span>3</span>
            <h3>변환하고, 가져가기</h3>
            <p>
              결과를 확인하고 개별 또는 ZIP 저장.
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
          unbg
          <ArrowRight size={12} />
        </a>
        <a href="https://huggingface.co/briaai/RMBG-1.4" target="_blank" rel="noreferrer">
          BRIA · 개인·비상업용
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
        aria-label="원본 이미지 교체"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) replaceFile(file);
          e.target.value = "";
        }}
      />
      <Shortcuts open={shortcuts} onClose={() => setShortcuts(false)} modifier={modifier} />
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
        <h2 id="guide-title">
          {isSingle ? "형식 변환부터, 배경 제거까지." : "좋은 결과는, 잘 맞는 두 장에서."}
        </h2>
        <p>
          {isSingle
            ? !removesBackground
              ? "기본은 배경 제거 꺼짐이에요. 파일을 올리고 저장 형식을 선택하면 돼요. PNG·WebP의 무손실 옵션은 디코딩한 픽셀을 보존해요. 품질 조절 압축과 크기 변경은 픽셀이 달라져요. JPG는 손실 압축이에요."
              : "무료 BRIA 모델이 브라우저에서 피사체를 찾아요. 토큰이나 API 키가 필요 없고, 원본 사진은 외부로 보내지 않아요."
            : "unbg는 서로 다른 단색 배경 위의 같은 피사체를 비교해서 투명도를 복원해요. 이 모드에서는 같은 크기의 두 장이 필요해요."}
        </p>
        {!isSingle && (
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
        )}
        <ul>
          <li>
            <MousePointer2 size={17} />
            <span>
              {isSingle
                ? !removesBackground
                  ? "형식만 변환할 때는 AI 모델을 다운로드하지 않아요. 압축과 크기 조절을 끄고 같은 형식을 선택하면 원본 그대로 저장해요."
                  : "첫 사용 시 모델 약 42 MB와 실행 파일 약 13 MB를 다운로드해요. 브라우저 캐시가 유지되면 다음에는 재사용해요."
                : "피사체 위치·크기·조명은 같게, 배경색만 바꿔 주세요."}
            </span>
          </li>
          <li>
            <Layers2 size={17} />
            <span>
              {isSingle
                ? "최대 50장을 순서대로 처리해요. 속도는 기기 성능에 따라 다르고, 브라우저 안에서 CPU로 실행해요."
                : "flower-white.png + flower-black.png처럼 이름을 맞추면 자동으로 연결돼요. 연결 후 A/B 이미지를 눌러 교체할 수도 있어요."}
            </span>
          </li>
          <li>
            <FileImage size={17} />
            <span>
              {isSingle
                ? !removesBackground
                  ? "무손실은 8-bit 픽셀 기준이에요. 형식이 달라지면 ICC 색상 프로필·EXIF 등 메타데이터는 보존하지 않아요. 16-bit PNG는 PNG로 원본 저장해 주세요. JPG로 바꾸면 투명한 부분은 흰색이 돼요."
                  : "모델은 1,024 × 1,024 크기로 피사체를 판단하고, 결과는 원본 크기로 저장해요. 머리카락·유리·반투명 그래픽은 직접 경계를 확인해 주세요. 움직이는 WebP는 지원하지 않아요."
                : "무손실 PNG가 가장 깨끗해요. JPG·WebP 압축 흔적은 결과에 남을 수 있어요. 투명 원본과 움직이는 WebP는 지원하지 않아요."}
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
          disabled={busy || demoLoading}
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
