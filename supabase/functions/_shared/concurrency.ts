// Bounded-concurrency map. Used by the push workers to overlap their
// PostgREST round trips without opening an unbounded number of connections.

export type Outcome<R> = { ok: true; value: R } | { ok: false; error: unknown };

/**
 * Applies `worker` to every item with at most `limit` calls in flight.
 *
 * Results keep the input order regardless of completion order. A worker
 * rejection is captured as an `ok: false` outcome for that item only — one
 * failure never cancels the rest of the batch, which matters because each
 * queue message must be accounted for individually.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Outcome<R>[]> {
  const results: Outcome<R>[] = new Array(items.length);
  let next = 0;

  const runner = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };

  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, runner));
  return results;
}
