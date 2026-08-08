// Minimal Expo push API client (https://docs.expo.dev/push-notifications/sending-notifications/).

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'default';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

/** Expo hard limit per /push/send request. */
export const EXPO_SEND_CHUNK = 100;
/** Expo hard limit per /push/getReceipts request. */
export const EXPO_RECEIPT_CHUNK = 300;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Sends a single chunk (<= 100 messages) to Expo. Throws on transport
 * failure or non-2xx so callers can leave pgmq messages for redelivery.
 * Tickets come back in the same order as the messages.
 */
export async function sendExpoChunk(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];
  if (messages.length > EXPO_SEND_CHUNK) {
    throw new Error(`expo send chunk too large: ${messages.length}`);
  }
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`expo push send failed: ${res.status} ${await safeText(res)}`);
  }
  const payload = await res.json();
  const tickets = (payload?.data ?? []) as ExpoPushTicket[];
  if (tickets.length !== messages.length) {
    throw new Error(`expo returned ${tickets.length} tickets for ${messages.length} messages`);
  }
  return tickets;
}

/** Fetches receipts for ticket ids, chunking internally. Throws on transport failure. */
export async function getExpoReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
  const receipts: Record<string, ExpoPushReceipt> = {};
  for (const part of chunk(ids, EXPO_RECEIPT_CHUNK)) {
    const res = await fetch(RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: part }),
    });
    if (!res.ok) {
      throw new Error(`expo receipts failed: ${res.status} ${await safeText(res)}`);
    }
    const payload = await res.json();
    Object.assign(receipts, payload?.data ?? {});
  }
  return receipts;
}

export function formatTicketError(t: ExpoPushTicket | ExpoPushReceipt): string {
  const detail = t.details?.error ? ` (${t.details.error})` : '';
  return `${t.message ?? 'error'}${detail}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}
