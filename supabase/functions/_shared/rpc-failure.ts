// Shapes database/RPC failures from push-dispatch and push-receipts into a
// structured log line and a short machine-readable 503 body. Only `code`,
// HTTP `status`, `name` and a truncated, redacted `message` leave the worker:
// PostgREST `details`/`hint` (which may carry SQL or offending values), request
// payloads and credentials never do.
import { InputError } from "./input.ts";

export type FailureReason =
  | "rpc_error" // PostgREST / Kong / supabase-js returned an error object
  | "aborted" // the per-call abort deadline fired before a response
  | "worker_deadline" // no time left in the invocation budget
  | "not_abortable" // request builder had no abortSignal (fail closed)
  | "invalid_response" // response shape rejected by record()/boundedString()
  | "exception"; // anything else thrown

export interface FailureDetail {
  reason: FailureReason;
  message: string;
  code?: string;
  status?: number;
  name?: string;
  /** Transport-level or 5xx: one bounded retry may succeed. */
  transient: boolean;
}

export const MESSAGE_LIMIT = 300;
export const RPC_RETRY_BACKOFF_MS = 2_000;

/** Thrown by the bounded RPC wrappers so callers see the shaped cause. */
export class RpcFailure extends Error {
  constructor(
    readonly step: string,
    readonly detail: FailureDetail,
    readonly elapsedMs: number,
    readonly aborted: boolean,
    readonly deadlineMs: number | null = null,
  ) {
    super(`${step}: ${detail.reason}`);
    this.name = "RpcFailure";
  }
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // JWTs (legacy anon / service-role keys) and new-style secret keys.
  [/\beyJ[\w-]{8,}\.[\w-]+\.[\w-]+/g, "[jwt]"],
  [/\bsb_(?:secret|publishable)_[\w-]+/g, "[key]"],
  [/\b(apikey|api_key|authorization)=([^&\s]+)/gi, "$1=[redacted]"],
  [/\bBearer\s+[\w.-]+/gi, "Bearer [redacted]"],
];

/** Collapses whitespace, redacts credential-shaped tokens, truncates. */
export function safeMessage(value: unknown): string {
  let text = typeof value === "string" ? value : String(value ?? "");
  text = text.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of SECRET_PATTERNS)
    text = text.replace(pattern, replacement);
  return text.length > MESSAGE_LIMIT
    ? `${text.slice(0, MESSAGE_LIMIT - 1)}…`
    : text;
}

// SQLSTATE classes that mean the request never ran to completion on a
// healthy connection: 08 connection exception, 53 insufficient resources
// (53300 too many connections), 57P01–57P03 server shutdown / cannot connect.
// PGRST001–003: PostgREST database connection / schema cache / pool timeout.
const TRANSIENT_CODE = /^(08|53|57P0[123]|PGRST00[123])/;

export function isTransient(
  status: number | undefined,
  code: string | undefined,
): boolean {
  // postgrest-js reports a failed fetch (DNS, TLS, reset, closed
  // connection) as status 0 with an empty code.
  if (status === 0) return true;
  if (status !== undefined && status >= 500) return true;
  return code !== undefined && TRANSIENT_CODE.test(code);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  source: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = source?.[key];
  if (typeof value === "string") return value.length ? value : undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function numberField(
  source: Record<string, unknown> | null,
  key: string,
): number | undefined {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Shapes the `error` half of a postgrest-js result. `status` is the response
 * status (0 when fetch itself failed); `aborted` says whether our own abort
 * signal fired, which is reported as its own reason and never retried.
 */
export function describeDbError(
  error: unknown,
  status: number | undefined,
  aborted = false,
): FailureDetail {
  const source = asRecord(error);
  const code = stringField(source, "code");
  const httpStatus =
    status ??
    numberField(source, "status") ??
    numberField(source, "statusCode");
  const message = safeMessage(
    stringField(source, "message") ?? (source ? "database error" : error),
  );
  const name = stringField(source, "name");
  if (aborted)
    return {
      reason: "aborted",
      message,
      code,
      status: httpStatus,
      name,
      transient: false,
    };
  return {
    reason: "rpc_error",
    message,
    code,
    status: httpStatus,
    name,
    transient: isTransient(httpStatus, code),
  };
}

/** Shapes anything caught by a handler: RpcFailure, InputError, Error, other. */
export function describeThrown(error: unknown): FailureDetail {
  if (error instanceof RpcFailure) return error.detail;
  if (error instanceof InputError)
    return {
      reason: "invalid_response",
      message: safeMessage(error.message),
      name: "InputError",
      transient: false,
    };
  const source = asRecord(error);
  return {
    reason: "exception",
    message: safeMessage(
      stringField(source, "message") ?? (source ? "error" : error),
    ),
    code: stringField(source, "code"),
    status: numberField(source, "status") ?? numberField(source, "statusCode"),
    name: stringField(source, "name"),
    transient: false,
  };
}

export interface LogContext {
  attempt?: number;
  elapsedMs?: number;
  aborted?: boolean;
  deadlineMs?: number | null;
  msgId?: number | string;
  deliveryId?: string;
}

/**
 * Emits one structured `console.error` line (Supabase edge logs index the
 * JSON) and returns the shaped detail so callers can build the 503 body.
 */
export function logFailure(
  fn: string,
  step: string,
  error: unknown,
  context: LogContext = {},
): FailureDetail {
  const detail = describeThrown(error);
  const failure = error instanceof RpcFailure ? error : null;
  console.error(
    JSON.stringify({
      event: "push_rpc_failure",
      function: fn,
      step: failure?.step ?? step,
      reason: detail.reason,
      code: detail.code,
      status: detail.status,
      name: detail.name,
      message: detail.message,
      transient: detail.transient,
      attempt: context.attempt,
      elapsed_ms: context.elapsedMs ?? failure?.elapsedMs,
      aborted: context.aborted ?? failure?.aborted,
      deadline_ms: context.deadlineMs ?? failure?.deadlineMs ?? undefined,
      msg_id: context.msgId,
      delivery_id: context.deliveryId,
    }),
  );
  return detail;
}

/** 503 body: generic error text plus a short machine-readable cause. */
export function failureBody(
  error: string,
  cause: unknown,
  step?: string,
): Record<string, unknown> {
  const detail = describeThrown(cause);
  const body: Record<string, unknown> = {
    ok: false,
    error,
    reason: detail.reason,
  };
  const resolvedStep = cause instanceof RpcFailure ? cause.step : step;
  if (resolvedStep) body.step = resolvedStep;
  if (detail.code) body.code = detail.code;
  if (detail.status !== undefined) body.status = detail.status;
  return body;
}

/**
 * Runs `run` and, when it fails with a transient (transport / 5xx) cause,
 * runs it exactly once more after a short backoff. Every attempt's failure is
 * logged; the last error is rethrown. Only for calls whose duplicate
 * execution is harmless (see the call sites for the lease argument).
 */
export async function retryOnceIfTransient<T>(
  fn: string,
  step: string,
  run: () => Promise<T>,
  backoffMs = RPC_RETRY_BACKOFF_MS,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const first = logFailure(fn, step, error, { attempt: 0 });
    if (!first.transient) throw error;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    try {
      return await run();
    } catch (retryError) {
      logFailure(fn, step, retryError, { attempt: 1 });
      throw retryError;
    }
  }
}
