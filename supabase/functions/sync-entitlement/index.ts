// sync-entitlement: fallback entitlement sync, called by the app with the
// user's JWT after a purchase/restore when the RevenueCat webhook is not
// (yet) configured. The client's own entitlement claims are NEVER trusted:
// the only source of truth is the RevenueCat REST API queried server-side
// with the secret API key.

import { createAdminClient } from '../_shared/admin.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';

// This is a single-tier app: any active RevenueCat entitlement means
// premium, regardless of its identifier. Checking the whole entitlements
// map (rather than one hardcoded id) keeps this in sync with the client's
// `hasPremium()` fallback in src/lib/purchases.ts, which treats any active
// entitlement as premium if the configured one isn't the active one.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, corsHeaders);

  const user = await getUserFromRequest(req);
  if (!user) return json({ error: 'unauthorized' }, 401, corsHeaders);

  const apiKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!apiKey) {
    // Not configured; the client treats this as a no-op.
    return json({ configured: false }, 501, corsHeaders);
  }

  let payload: Record<string, unknown>;
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );
    if (!res.ok) {
      console.error(`sync-entitlement: revenuecat responded ${res.status}`);
      return json({ error: 'revenuecat unavailable' }, 502, corsHeaders);
    }
    payload = await res.json();
  } catch (err) {
    console.error('sync-entitlement: revenuecat fetch failed:', err);
    return json({ error: 'revenuecat unavailable' }, 502, corsHeaders);
  }

  // deno-lint-ignore no-explicit-any
  const subscriber = (payload as any)?.subscriber ?? {};
  // deno-lint-ignore no-explicit-any
  const entitlementsRaw = (subscriber?.entitlements ?? {}) as Record<string, any>;

  const isActive = (expiresDate: Date | null): boolean =>
    expiresDate === null ||
    (!Number.isNaN(expiresDate.getTime()) && expiresDate.getTime() > Date.now());

  // subscriber.entitlements lists every entitlement ever granted (active
  // and expired); filter down to the ones currently active. A null
  // expires_date means non-expiring (e.g. a lifetime/non-subscription
  // product), which counts as active.
  const activeEntitlements = Object.entries(entitlementsRaw)
    .map(([id, entitlement]) => {
      const expiresDate = entitlement?.expires_date ? new Date(entitlement.expires_date) : null;
      const productId: string | null = entitlement?.product_identifier ?? null;
      // period_type lives on the subscription object keyed by product id.
      const subscription = productId ? subscriber?.subscriptions?.[productId] : null;
      const purchaseDate = entitlement?.purchase_date ? new Date(entitlement.purchase_date) : null;
      return {
        id,
        expiresDate,
        productId,
        purchaseDate,
        periodType: (entitlement?.period_type ?? subscription?.period_type ?? null) as string | null,
      };
    })
    .filter((e) => isActive(e.expiresDate));

  const isPremium = activeEntitlements.length > 0;

  // Among active entitlements, keep the most recently purchased one for
  // the product_id/expires_at/period_type columns (informational only —
  // `is_premium` is what actually gates access, and it's true if ANY
  // entitlement is active).
  const newest = activeEntitlements.slice().sort((a, b) => {
    const at = a.purchaseDate?.getTime() ?? 0;
    const bt = b.purchaseDate?.getTime() ?? 0;
    return bt - at;
  })[0] ?? null;

  const productId = newest?.productId ?? null;
  const expiresDate = newest?.expiresDate ?? null;
  const periodType = newest?.periodType ?? null;

  const admin = createAdminClient();
  const { error: upsertError } = await admin.from('entitlements').upsert(
    {
      user_id: user.id,
      is_premium: isPremium,
      product_id: productId,
      expires_at: expiresDate && !Number.isNaN(expiresDate.getTime())
        ? expiresDate.toISOString()
        : null,
      period_type: periodType ? String(periodType).toLowerCase() : null,
      source: 'sync-api',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (upsertError) {
    console.error('sync-entitlement: upsert failed:', upsertError);
    return json({ error: 'persist failed' }, 500, corsHeaders);
  }

  const { error: recalcError } = await admin.rpc('recalc_notification_state', {
    p_user: user.id,
  });
  if (recalcError) {
    console.error('sync-entitlement: recalc failed:', recalcError);
  }

  return json({ ok: true, is_premium: isPremium }, 200, corsHeaders);
});
