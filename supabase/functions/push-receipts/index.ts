// push-receipts: invoked every 15 minutes by pg_cron via pg_net. Fetches
// Expo delivery receipts for tickets older than 15 minutes and finalizes
// delivery rows. Deploy with --no-verify-jwt: auth is the x-dispatch-secret.

import { createAdminClient } from '../_shared/admin.ts';
import { requireDispatchSecret } from '../_shared/auth.ts';
import { formatTicketError, getExpoReceipts } from '../_shared/expo.ts';
import { json } from '../_shared/http.ts';

const BATCH_LIMIT = 300;
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

  for (const delivery of deliveries) {
    const receipt = receipts[delivery.expo_ticket_id];

    if (!receipt) {
      if (Date.now() - new Date(delivery.sent_at).getTime() > RECEIPT_EXPIRY_MS) {
        // Never resolvable; close it out so it stops occupying the batch.
        await admin
          .from('notification_deliveries')
          .update({
            status: 'receipt_error',
            error_detail: 'receipt not available from Expo (expired unfetched)',
          })
          .eq('id', delivery.id);
        stats.expired++;
      } else {
        stats.pending++; // Expo has not processed it yet; retry next run
      }
      continue;
    }

    if (receipt.status === 'ok') {
      await admin
        .from('notification_deliveries')
        .update({ status: 'receipt_ok' })
        .eq('id', delivery.id);
      stats.receipt_ok++;
      continue;
    }

    await admin
      .from('notification_deliveries')
      .update({ status: 'receipt_error', error_detail: formatTicketError(receipt) })
      .eq('id', delivery.id);
    stats.receipt_error++;

    if (receipt.details?.error === 'DeviceNotRegistered' && delivery.device_id) {
      await admin
        .from('devices')
        .update({ active: false, push_token: null })
        .eq('id', delivery.device_id);
    }
  }

  return json(stats);
});
