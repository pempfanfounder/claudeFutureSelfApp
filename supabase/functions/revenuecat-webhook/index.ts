// revenuecat-webhook: receives RevenueCat server events and mirrors them
// into public.entitlements. The app calls Purchases.logIn(supabaseUserId),
// so app_user_id is the Supabase auth UUID; RevenueCat anonymous ids
// ('$RCAnonymousID:...') are ignored. Deploy with --no-verify-jwt: auth is
// the shared Authorization bearer secret configured in RevenueCat.

import { createAdminClient } from '../_shared/admin.ts';
import { json } from '../_shared/http.ts';

// Event types that (re)grant access — subject to the expiration check.
const ACTIVE_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TRANSFER',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const auth = req.headers.get('Authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  // From here on, always answer 200: RevenueCat retries on non-200 and a
  // retry storm cannot fix a bad payload or a bug on our side.
  let event: Record<string, unknown> | null = null;
  try {
    const body = await req.json();
    event = (body?.event ?? null) as Record<string, unknown> | null;
  } catch {
    return json({ ok: false, reason: 'invalid json' });
  }
  if (!event || typeof event.type !== 'string') {
    return json({ ok: false, reason: 'missing event' });
  }

  const userId = String(event.app_user_id ?? '');
  if (!UUID_RE.test(userId)) {
    return json({ ok: true, ignored: 'non-uuid app_user_id' });
  }

  try {
    const type = event.type;
    const expiresAtMs = typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;

    let isPremium: boolean | null = null;
    if (ACTIVE_EVENT_TYPES.has(type)) {
      // TRANSFER and friends only grant access while the entitlement is
      // actually unexpired.
      isPremium = expiresAtMs === null || expiresAtMs > Date.now();
    } else if (type === 'EXPIRATION') {
      isPremium = false;
    }
    if (isPremium === null) {
      // CANCELLATION (auto-renew off, still paid up), BILLING_ISSUE, TEST,
      // etc. do not change access; EXPIRATION arrives when access ends.
      return json({ ok: true, ignored: type });
    }

    const admin = createAdminClient();
    const { error: upsertError } = await admin.from('entitlements').upsert(
      {
        user_id: userId,
        is_premium: isPremium,
        product_id: (event.product_id as string | undefined) ?? null,
        expires_at: expiresAtMs !== null ? new Date(expiresAtMs).toISOString() : null,
        period_type: typeof event.period_type === 'string'
          ? event.period_type.toLowerCase()
          : null,
        source: 'revenuecat-webhook',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (upsertError) throw upsertError;

    const { error: recalcError } = await admin.rpc('recalc_notification_state', {
      p_user: userId,
    });
    if (recalcError) throw recalcError;

    return json({ ok: true });
  } catch (err) {
    console.error('revenuecat-webhook:', err);
    return json({ ok: false });
  }
});
