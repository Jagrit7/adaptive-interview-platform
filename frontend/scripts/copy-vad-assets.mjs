/**
 * Copies the Silero VAD model and the ONNX runtime into `public/vad`.
 *
 * These are build inputs, not source. They are ~13MB of binary that changes
 * only when the dependency version changes, so they are copied from
 * node_modules on every build and git-ignored rather than committed - the
 * repository has already been trimmed of large tracked files once.
 *
 * Runs from `predev` and `prebuild`, so a fresh clone needs nothing but
 * `npm install`.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'public', 'vad');

const assets = [
  ['@ricky0123/vad-web/dist/silero_vad_v5.onnx', 'silero_vad_v5.onnx'],
  ['@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', 'vad.worklet.bundle.min.js'],
  // The "/wasm" entry point resolves to the bundled build, which loads exactly
  // this one binary. The jsep/asyncify/jspi variants are for WebGPU and are
  // deliberately not shipped.
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
];

await mkdir(out, { recursive: true });
for (const [from, to] of assets) {
  const src = join(root, 'node_modules', from);
  if (!existsSync(src)) {
    // A missing asset must not pass silently: the VAD would fail to load in the
    // browser with a 404 that looks like a network problem.
    console.error(`[vad-assets] missing ${src} - run npm install`);
    process.exit(1);
  }
  await copyFile(src, join(out, to));
}
console.log(`[vad-assets] copied ${assets.length} files into public/vad`);
