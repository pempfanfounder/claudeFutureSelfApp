// push-receipts: invoked every 15 minutes by pg_cron via pg_net. Fetches
// Expo delivery receipts for tickets older than 15 minutes and finalizes
// delivery rows. Deploy with --no-verify-jwt: auth is the x-dispatch-secret.

import { createAdminClient } from '../_shared/admin.ts';
import { requireDispatchSecret } from '../_shared/auth.ts';
import { formatTicketError, getExpoReceipts } from '../_shared/expo.ts';
import { json } from '../_shared/http.ts';

const BATCH_LIMIT = 1000;
const MIN_TICKET_AGE_MS = 15 * 60 * 1000;
// Expo keeps receipts ~24h; after that an absent receipt will never appear.
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface PendingDelivery {
  id: string;
  expo_ticket_id: string;
  device_id: string | null;
  sent_at: string;
}

Deno.serve(async (req) => {
  const denied = requireDispatchSecret(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - MIN_TICKET_AGE_MS).toISOString();

  const { data, error } = await admin
    .from('notification_deliveries')
    .select('id, expo_ticket_id, device_id, sent_at')
    .eq('status', 'ticket_ok')
    .not('expo_ticket_id', 'is', null)
    .lt('sent_at', cutoff)
    .order('sent_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) return json({ error: error.message }, 500);

  const deliveries = (data ?? []) as PendingDelivery[];
  if (deliveries.length === 0) return json({ checked: 0 });

  let receipts;
  try {
    receipts = await getExpoReceipts(deliveries.map((d) => d.expo_ticket_id));
  } catch (err) {
    console.error('push-receipts: expo fetch failed:', err);
    return json({ error: 'expo receipts unavailable' }, 502);
  }

  const stats = { checked: deliveries.length, receipt_ok: 0, receipt_error: 0, pending: 0, expired: 0 };

  // Bucket first, write once per bucket. The ok case is uniform so it
  // collapses to a single UPDATE regardless of batch size; error rows carry
  // per-row detail and stay individual, which is fine because they are rare.
  const okIds: string[] = [];
  const expiredIds: string[] = [];
  const errored: Array<{ id: string; detail: string }> = [];
  const deadDeviceIds: string[] = [];

  for (const delivery of deliveries) {
    const receipt = receipts[delivery.expo_ticket_id];

    if (!receipt) {
      if (Date.now() - new Date(delivery.sent_at).getTime() > RECEIPT_EXPIRY_MS) {
        // Never resolvable; close it out so it stops occupying the batch.
        expiredIds.push(delivery.id);
        stats.expired++;
      } else {
        stats.pending++; // Expo has not processed it yet; retry next run
      }
      continue;
    }

    if (receipt.status === 'ok') {
      okIds.push(delivery.id);
      stats.receipt_ok++;
      continue;
    }

    errored.push({ id: delivery.id, detail: formatTicketError(receipt) });
    stats.receipt_error++;

    if (receipt.details?.error === 'DeviceNotRegistered' && delivery.device_id) {
      deadDeviceIds.push(delivery.device_id);
    }
  }

  if (okIds.length > 0) {
    const { error: okError } = await admin
      .from('notification_deliveries')
      .update({ status: 'receipt_ok' })
      .in('id', okIds);
    if (okError) console.error('push-receipts: receipt_ok update failed:', okError);
  }

  if (expiredIds.length > 0) {
    const { error: expiredError } = await admin
      .from('notification_deliveries')
      .update({
        status: 'receipt_error',
        error_detail: 'receipt not available from Expo (expired unfetched)',
      })
      .in('id', expiredIds);
    if (expiredError) console.error('push-receipts: expired update failed:', expiredError);
  }

  for (const row of errored) {
    const { error: errUpdate } = await admin
      .from('notification_deliveries')
      .update({ status: 'receipt_error', error_detail: row.detail })
      .eq('id', row.id);
    if (errUpdate) console.error('push-receipts: receipt_error update failed:', errUpdate);
  }

  if (deadDeviceIds.length > 0) {
    const { error: deviceError } = await admin
      .from('devices')
      .update({ active: false, push_token: null })
      .in('id', deadDeviceIds);
    if (deviceError) console.error('push-receipts: device deactivation failed:', deviceError);
  }

  return json(stats);
});
