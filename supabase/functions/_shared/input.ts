/** Bounded parsing shared by server handlers; never coerce malformed input. */
export class InputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError(`invalid ${label}`);
  return value as Record<string, unknown>;
}
export function boundedString(
  value: unknown,
  label: string,
  max = 128,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max)
    throw new InputError(`invalid ${label}`);
  return value;
}
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function readBoundedJson(
  source: Request | Response,
  maxBytes: number,
): Promise<unknown> {
  const advertised = source.headers.get("content-length");
  if (
    advertised !== null &&
    (!/^\d+$/.test(advertised) || Number(advertised) > maxBytes)
  )
    throw new InputError("body too large", 413);
  if (!source.body) throw new InputError("missing body");
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new InputError("body too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InputError("invalid json");
  }
}
export function equalSecret(
  actual: string | null,
  expected: string | undefined,
): boolean {
  if (!actual || !expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
