import { useEffect, useRef } from "react";
import { Keyboard, X } from "lucide-react";
export function Shortcuts({
  open,
  onClose,
  modifier,
}: {
  open: boolean;
  onClose: () => void;
  modifier: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const items = [
    ["이미지 붙여넣기", `${modifier} V`],
    ["이미지 파일 열기", `${modifier} O`],
    ["선택 이미지 변환", `${modifier} Enter`],
    ["선택 결과 ZIP 저장", `${modifier} Shift S`],
    ["원본·결과 비교 전환", "B"],
    ["화면에 맞추기", "0"],
    ["실제 크기 100%", "1"],
    ["이전·다음 이미지", "← / →"],
    ["처리 중지 / 안내 닫기", "Esc"],
    ["단축키 안내", "?"],
  ];
  return (
    <dialog
      ref={dialog}
      className="guide-dialog shortcut-dialog"
      aria-labelledby="shortcut-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="dialog-heading">
        <Keyboard size={24} />
        <button className="icon-button" aria-label="단축키 안내 닫기" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <h2 id="shortcut-title">손에 익으면, 더 빠르게.</h2>
      <p>파일명이나 옵션을 입력할 때는 편집에 집중할 수 있도록 작업 단축키가 잠시 쉬어요.</p>
      <dl className="shortcut-list">
        {items.map(([label, keys]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {keys.split(" ").map((key, index) => (
                <kbd key={index}>{key}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="section-help">
        복사한 이미지가 있어야 붙여넣을 수 있어요. 이미지 주소나 텍스트는 업로드하지 않아요.
      </p>
    </dialog>
  );
}
export function isEditing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
      ),
    )
  );
}
