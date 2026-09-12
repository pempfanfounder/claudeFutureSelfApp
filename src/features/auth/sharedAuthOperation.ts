import { withDeadline } from "@/lib/appState";

// A timed-out signup/sign-in/sign-out still mutates SDK storage and emits events.
// Keep new account actions fenced for the entire underlying operation.
let active: Promise<unknown> | null = null;
export function sharedAuthPending() {
  return active !== null;
}
export async function runSharedAuthOperation<T>(
  work: () => Promise<T>,
): Promise<T> {
  if (active)
    throw new Error(
      "The account service has not finished. Wait or restart the app before reconnecting.",
    );
  const result = Promise.resolve().then(work);
  active = result;
  void result
    .finally(() => {
      if (active === result) active = null;
    })
    .catch(() => {});
  return withDeadline(result);
}
