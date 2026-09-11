export const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="petal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a4caff"/><stop offset=".38" stop-color="#5a86fb"/><stop offset=".72" stop-color="#254cef"/><stop offset="1" stop-color="#173da6"/></linearGradient><radialGradient id="center"><stop stop-color="#cedbff"/><stop offset=".6" stop-color="#4975f9"/><stop offset="1" stop-color="#315cdb"/></radialGradient></defs><g transform="translate(400 400)">${Array.from({ length: 8 }, (_, i) => `<ellipse cx="0" cy="-130" rx="89" ry="173" fill="url(#petal)" opacity=".78" stroke="#b3d2ff" stroke-opacity=".6" stroke-width="1.5" transform="rotate(${i * 45})"/>`).join("")}<circle r="79" fill="url(#center)"/><ellipse cx="-21" cy="-25" rx="30" ry="16" fill="#e8f2ff" opacity=".28" transform="rotate(-30)"/></g></svg>`;
export async function createDemoFiles(single = false): Promise<File[]> {
  const url = URL.createObjectURL(new Blob([DEMO_SVG], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const files: File[] = [];
    for (const [label, color] of [
      ["white", "#ffffff"],
      ["black", "#000000"],
    ]) {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("예제 이미지를 만들 수 없습니다.");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 800, 800);
      ctx.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("예제 생성 실패"))), "image/png"),
      );
      files.push(new File([blob], `bloom-${label}.png`, { type: "image/png" }));
    }
    return single ? files.slice(0, 1) : files;
  } finally {
    URL.revokeObjectURL(url);
  }
}
