import { assertCurrentIdentity, type Identity } from "./appState";

// All account persistence and account cleanup share one queue. A departed
// account cannot recreate a cache after its cleanup has completed.
let queue: Promise<unknown> = Promise.resolve();
let stalled = false;
export const storageNeedsRestart = () => stalled;
export function serializedStorage<T>(work: () => Promise<T>): Promise<T> {
  if (stalled)
    return Promise.reject(
      new Error("Device storage has not finished. Restart the app to recover."),
    );
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      stalled = true;
      reject(
        new Error(
          "Device storage has not finished. Restart the app to recover.",
        ),
      );
    }, 8000);
  });
  // Timeout ends the caller's wait, never the persistence ordering guarantee.
  void result
    .finally(() => {
      clearTimeout(timer);
      stalled = false;
    })
    .catch(() => {});
  return Promise.race([result, timeout]);
}

export function ownedStorage<T>(
  identity: Identity,
  work: () => Promise<T>,
): Promise<T> {
  return serializedStorage(async () => {
    assertCurrentIdentity(identity);
    const result = await work();
    assertCurrentIdentity(identity);
    return result;
  });
}
