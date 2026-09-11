import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXPORT, exportPlan, validateExport } from '../src/export-plan.ts';
test('default preserves original dimensions', () => {
  assert.deepEqual(exportPlan(1920, 1080, DEFAULT_EXPORT), [{ width: 1920, height: 1080, scale: 1, capped: false }]);
});
test('portrait and landscape resize with aspect ratio', () => {
  const options = { ...DEFAULT_EXPORT, resizeMode: 'longest', resizeValue: 600 };
  assert.equal(exportPlan(1200, 1800, options)[0].width, 400);
  assert.equal(exportPlan(1800, 1200, options)[0].height, 400);
});
test('retina exports use the requested base size, capped at source', () => {
  assert.deepEqual(exportPlan(1000, 500, { ...DEFAULT_EXPORT, resizeMode: 'width', resizeValue: 400, scales: [1, 2, 3] }).map(({ width, height, capped }) => [width, height, capped]), [[400,200,false],[800,400,false],[1000,500,true]]);
});
test('duplicate capped sizes collapse to one actual file', () => {
  assert.equal(exportPlan(300, 200, { ...DEFAULT_EXPORT, scales: [1, 2, 3] }).length, 1);
});
test('explicit upscaling works and memory bounds reject oversized exports', () => {
  assert.equal(exportPlan(400, 200, { ...DEFAULT_EXPORT, scales: [2], allowUpscale: true })[0].width, 800);
  assert.throws(() => exportPlan(4000, 4000, { ...DEFAULT_EXPORT, scales: [2], allowUpscale: true }), /1,600/);
});
test('invalid dimensions, quality, or empty exports fail before processing', () => {
  for (const patch of [{ resizeValue: NaN }, { resizeValue: 0 }, { resizeValue: 12.5 }, { scales: [] }, { scales: [99] }, { webpQuality: 101 }]) assert.throws(() => validateExport({ ...DEFAULT_EXPORT, ...patch }));
});
