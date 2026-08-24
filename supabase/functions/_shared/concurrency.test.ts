import { deepStrictEqual as assertEquals } from 'node:assert/strict';
import { mapWithConcurrency } from './concurrency.ts';

Deno.test('preserves input order regardless of completion order', async () => {
  const delays = [30, 5, 20, 1];
  const results = await mapWithConcurrency(delays, 4, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms));
    return i;
  });
  assertEquals(results.map((r) => (r.ok ? r.value : null)), [0, 1, 2, 3]);
});

Deno.test('never exceeds the concurrency limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 50 }, (_, i) => i);
  await mapWithConcurrency(items, 10, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    return null;
  });
  assertEquals(peak <= 10, true, `peak concurrency was ${peak}`);
});

Deno.test('captures per-item errors without failing the batch', async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('boom');
    return n * 10;
  });
  assertEquals(results[0], { ok: true, value: 10 });
  assertEquals(results[1].ok, false);
  assertEquals((results[1] as { ok: false; error: Error }).error.message, 'boom');
  assertEquals(results[2], { ok: true, value: 30 });
});

Deno.test('handles an empty input array', async () => {
  const results = await mapWithConcurrency([], 10, async () => 1);
  assertEquals(results, []);
});

Deno.test('handles a limit larger than the input length', async () => {
  const results = await mapWithConcurrency([1, 2], 100, async (n) => n);
  assertEquals(results.map((r) => (r.ok ? r.value : null)), [1, 2]);
});

Deno.test('runs every item exactly once', async () => {
  const seen: number[] = [];
  const items = Array.from({ length: 25 }, (_, i) => i);
  await mapWithConcurrency(items, 4, async (n) => {
    seen.push(n);
    return n;
  });
  assertEquals(seen.length, 25);
  assertEquals(new Set(seen).size, 25);
});
