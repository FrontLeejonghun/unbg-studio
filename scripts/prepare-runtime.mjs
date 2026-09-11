import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.resolve("@huggingface/transformers"));
const source = dirname(require.resolve("onnxruntime-web"));
const destination = fileURLToPath(new URL("../public/vendor/transformers-4.2.0/", import.meta.url));
await rm(fileURLToPath(new URL("../public/vendor/transformers-3.8.1/", import.meta.url)), {
  recursive: true,
  force: true,
});
await mkdir(destination, { recursive: true });
for (const file of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  await copyFile(join(source, file), join(destination, file));
}
