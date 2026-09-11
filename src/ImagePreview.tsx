import { useEffect, useRef, useState } from "react";
export function ImagePreview({
  original,
  result,
  width,
  height,
  compare,
  zoom,
  alt,
  resultLabel = "결과",
}: {
  original: string;
  result: string;
  width: number;
  height: number;
  compare: boolean;
  zoom: number;
  alt: string;
  resultLabel?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 600, height: 400 });
  const [split, setSplit] = useState(50);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const factor =
    zoom === 0
      ? Math.min((bounds.width - 32) / width, (bounds.height - (compare ? 58 : 24)) / height, 1)
      : zoom / 100;
  const renderedWidth = Math.max(1, width * factor);
  const renderedHeight = Math.max(1, height * factor);
  return (
    <div className="image-viewport" ref={viewport}>
      <div className="image-pan">
        <div
          className="comparison-frame"
          style={{
            width: renderedWidth,
            height: renderedHeight,
            touchAction: compare ? "none" : "auto",
          }}
          onPointerDown={(event) => {
            if (compare) {
              event.currentTarget.setPointerCapture(event.pointerId);
              const box = event.currentTarget.getBoundingClientRect();
              setSplit(Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)));
            }
          }}
          onPointerMove={(event) => {
            if (compare && event.currentTarget.hasPointerCapture(event.pointerId)) {
              const box = event.currentTarget.getBoundingClientRect();
              setSplit(Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)));
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <img
            src={result}
            width={width}
            height={height}
            alt={`${alt} ${resultLabel}`}
            draggable={false}
            style={compare ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}
          />
          {compare && (
            <>
              <div
                className="comparison-original"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              >
                <img
                  src={original}
                  width={width}
                  height={height}
                  alt={`${alt} 원본`}
                  draggable={false}
                />
              </div>
              <div className="comparison-line" style={{ left: `${split}%` }}>
                <span>↔</span>
              </div>
            </>
          )}
        </div>
      </div>
      {compare && (
        <div className="comparison-control">
          <span>원본</span>
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            aria-label="원본과 결과 비교 위치"
            onChange={(event) => setSplit(Number(event.target.value))}
          />
          <span>결과</span>
        </div>
      )}
    </div>
  );
}
