/** Native requests cannot be cancelled by rejecting a JavaScript promise. */
export class PurchaseQueueTimeoutError extends Error {
  constructor() {
    super(
      "The purchase service has not finished. Restart the app to reconnect safely.",
    );
    this.name = "PurchaseQueueTimeoutError";
  }
}

/** Serialize native identity operations and transactions without overlapping them. */
export function createPurchaseQueue() {
  let tail: Promise<void> = Promise.resolve();
  let stalled = false;

  function run<T>(
    work: () => Promise<T>,
    timeoutMs: number | null = 10_000,
  ): Promise<T> {
    if (stalled) return Promise.reject(new PurchaseQueueTimeoutError());
    // The caller may time out, but tail must still wait for the REAL native result.
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (error: unknown) => void;
    const response = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    tail = tail.then(async () => {
      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Time waiting behind a StoreKit sheet is not a network timeout.
      if (timeoutMs !== null) {
        timer = setTimeout(() => {
          expired = true;
          stalled = true;
          reject(new PurchaseQueueTimeoutError());
        }, timeoutMs);
      }
      try {
        resolve(await work());
      } catch (error) {
        reject(error);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (expired) stalled = false;
      }
    });
    return response;
  }

  return { run, isStalled: () => stalled };
}
