// Per-call abort deadline for push-dispatch / push-receipts database RPCs.
//
// The database side is fast (claim_push_receipts ~14 ms, queue_read ~5 ms),
// but an edge cold start plus the first PostgREST round-trip takes ~4–6 s on
// this project. The first RPC of every cold invocation must fit inside this
// deadline or the run fails with 503 before any work happens.

export const DEFAULT_PUSH_RPC_DEADLINE_MS = 10_000;
export const MIN_PUSH_RPC_DEADLINE_MS = 1_000;
// push-receipts has no per-invocation deadline: its worst case is three RPCs
// plus an 8 s provider call (3 × deadline + 8 s), which must finish inside the
// 45 s receipt lease taken by claim_push_receipts(). 12 s keeps that at 44 s.
export const MAX_PUSH_RPC_DEADLINE_MS = 12_000;

/**
 * Resolves the RPC deadline from a raw PUSH_RPC_DEADLINE_MS value. Anything
 * unset, non-numeric, or outside the accepted range falls back to the default
 * so a typo in a function secret can never disable the abort.
 */
export function resolveRpcDeadlineMs(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PUSH_RPC_DEADLINE_MS;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return DEFAULT_PUSH_RPC_DEADLINE_MS;
  const value = Number(trimmed);
  if (value < MIN_PUSH_RPC_DEADLINE_MS || value > MAX_PUSH_RPC_DEADLINE_MS)
    return DEFAULT_PUSH_RPC_DEADLINE_MS;
  return value;
}

export const PUSH_RPC_DEADLINE_MS = resolveRpcDeadlineMs(
  Deno.env.get("PUSH_RPC_DEADLINE_MS"),
);
