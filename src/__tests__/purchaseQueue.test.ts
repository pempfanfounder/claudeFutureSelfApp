import { createPurchaseQueue, PurchaseQueueTimeoutError } from "../lib/purchaseQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("does not time out a refresh while it waits behind a StoreKit sheet", async () => {
  const queue = createPurchaseQueue();
  const native = deferred<number>();
  const purchase = queue.run(() => native.promise, null);
  const refresh = jest.fn(async () => 2);
  const next = queue.run(refresh, 10_000);
  await jest.advanceTimersByTimeAsync(240_000);
  expect(queue.isStalled()).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
  native.resolve(1);
  await expect(purchase).resolves.toBe(1);
  await expect(next).resolves.toBe(2);
});

it("retains native serialization after a response deadline expires", async () => {
  const queue = createPurchaseQueue();
  const native = deferred<number>();
  const request = queue.run(() => native.promise, 100);
  const failed = expect(request).rejects.toBeInstanceOf(PurchaseQueueTimeoutError);
  const waiting = jest.fn(async () => 2);
  const next = queue.run(waiting, 100);
  await jest.advanceTimersByTimeAsync(100);
  await failed;
  expect(queue.isStalled()).toBe(true);
  expect(waiting).not.toHaveBeenCalled();
  const prohibited = jest.fn(async () => 3);
  await expect(queue.run(prohibited)).rejects.toBeInstanceOf(PurchaseQueueTimeoutError);
  expect(prohibited).not.toHaveBeenCalled();
  native.resolve(1);
  await expect(next).resolves.toBe(2);
  expect(queue.isStalled()).toBe(false);
  await expect(queue.run(async () => 4)).resolves.toBe(4);
});

it("continues after a native rejection or synchronous throw", async () => {
  const queue = createPurchaseQueue();
  await expect(queue.run(() => { throw new Error("test"); })).rejects.toThrow("test");
  await expect(queue.run(async () => 2)).resolves.toBe(2);
  expect(queue.isStalled()).toBe(false);
});
