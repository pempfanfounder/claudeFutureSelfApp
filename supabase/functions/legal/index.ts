// DO NOT DEPLOY until OWNER placeholders below are replaced with real values.
//
// legal: serves the Terms of Service and Privacy Policy as public HTML
// pages, so the app has working legal links without external hosting.
// Deploy with --no-verify-jwt (public pages).

const LAST_UPDATED = 'August 10, 2026';
const CONTACT = 'denizsahinbusiness@gmail.com';
const COMPANY = 'Improvement Labs';

// Business identity (Dutch trader disclosure). Placeholders MUST be
// replaced with the real KVK/BTW/address values before deploying.
const OWNER = {
  tradeName: 'Improvement Labs',
  kvk: '[KVK-NUMMER — INVULLEN VOOR DEPLOY]',
  btw: '[BTW-ID — INVULLEN VOOR DEPLOY]',
  address: '[ZAKELIJK ADRES — INVULLEN VOOR DEPLOY]',
};

// Runtime guard (review finding 7): if a habitual deploy ships this file
// with the placeholders still in place, render the pages WITHOUT the
// identity block rather than publishing "[… INVULLEN …]" to reviewers.
const OWNER_READY = ![OWNER.kvk, OWNER.btw, OWNER.address].some((v) =>
  v.includes('INVULLEN'),
);
if (!OWNER_READY) {
  console.error(
    'legal: OWNER placeholders not filled in — serving pages without the identity block',
  );
}

const OWNER_BLOCK = OWNER_READY
  ? `
<p>${OWNER.tradeName}<br>
KVK: ${OWNER.kvk}<br>
BTW-id: ${OWNER.btw}<br>
${OWNER.address}<br>
<a href="mailto:${CONTACT}">${CONTACT}</a></p>`
  : `
<p>${OWNER.tradeName}<br>
<a href="mailto:${CONTACT}">${CONTACT}</a></p>`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Future Self</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; background: #F3E9DC; color: #3B2E25;
         max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; line-height: 1.6; }
  h1 { font-size: 1.9rem; margin-bottom: .25rem; }
  h2 { font-size: 1.2rem; margin-top: 2rem; }
  .meta { color: #8A7770; font-size: .9rem; margin-bottom: 2rem; }
  a { color: #B4553C; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="meta">Future Self · ${COMPANY} · Last updated ${LAST_UPDATED}</p>
${body}
</body>
</html>`;
}

const TERMS = page(
  'Terms of Service',
  `
<p>These Terms govern your use of the Future Self mobile application ("the
app"), operated by ${COMPANY} ("we", "us"). By using the app you agree to
these Terms.</p>

<h2>1. The service</h2>
<p>Future Self delivers motivational quotes, affirmations, reminders, streak
tracking and home-screen widgets. Content is provided for motivation and
general well-being only; it is not medical, psychological, financial or other
professional advice.</p>

<h2>2. Subscriptions and purchases</h2>
<p>The app requires a paid membership, sold as an auto-renewing subscription
(monthly or yearly, which may include an introductory free trial) or a
one-time lifetime purchase. Payment is charged to your Apple or Google
account. Subscriptions renew automatically unless cancelled at least 24 hours
before the end of the current period; manage or cancel anytime in your App
Store or Google Play account settings. Prices are shown in the app before
purchase. Refunds are handled by Apple/Google under their store policies.
By starting the subscription or trial you request immediate access to
digital content and acknowledge that, once delivery has begun, the EU
14-day right of withdrawal no longer applies; you can still cancel future
renewals anytime.</p>

<h2>3. Your account</h2>
<p>The app works with an anonymous account created on first launch; you may
optionally link it to Apple, Google, or an email address. You are responsible
for activity under your account. You may delete your account and its data at
any time in Settings → Account → Delete account.</p>

<h2>4. Acceptable use</h2>
<p>Do not misuse the app: no reverse engineering except where permitted by
law, no abuse of the service or other users, no automated scraping of
content, and no use that violates applicable law. Text you save in the app
(such as a personal goal) must be yours to use.</p>

<h2>5. Content and intellectual property</h2>
<p>The app, its design, and its content library are owned by us or our
licensors. Historical quotations are attributed to their authors. We grant
you a personal, non-transferable licence to use the app for its intended
purpose. Sharing an individual quote card socially is welcome.</p>

<h2>6. Disclaimers and liability</h2>
<p>The app is provided "as is" without warranties of any kind to the extent
permitted by law. To the maximum extent permitted by law, ${COMPANY} is not
liable for indirect, incidental or consequential damages arising from use of
the app; our total liability is limited to the amount you paid in the twelve
months before the claim.</p>

<h2>7. Changes and termination</h2>
<p>We may update the app and these Terms; material changes will be shown in
the app or on this page with an updated date. We may suspend accounts that
violate these Terms. You can stop using the app at any time.</p>

<h2>8. Contact</h2>
<p>Questions about these Terms: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
${OWNER_BLOCK}

<h2>9. Apple</h2>
<p>These Terms are an agreement between you and ${COMPANY} only — not with
Apple Inc. ("Apple"). Apple has no obligation whatsoever to furnish any
maintenance or support services for the app, and Apple provides no warranty
for the app of any kind. Apple is not responsible for addressing any claims
relating to the app or your use of it, including product liability claims,
claims that the app fails to conform to any applicable legal or regulatory
requirement, and claims arising under consumer protection or similar
legislation; nor is Apple responsible for the investigation, defence,
settlement or discharge of any third-party claim that the app infringes
intellectual property rights. Apple and Apple's subsidiaries are third-party
beneficiaries of these Terms, and upon your acceptance Apple has the right
(and is deemed to have accepted the right) to enforce these Terms against
you.</p>
`,
);

const PRIVACY = page(
  'Privacy Policy',
  `
<p>This policy explains what Future Self (operated by ${COMPANY}) collects,
why, and your choices. Short version: your reflections stay private, we do
not sell your data, and analytics never receives your free-text answers.</p>

<h2>1. What we collect</h2>
<p><strong>Account data:</strong> an anonymous account id created at first
launch; if you link a sign-in method, your Apple/Google identifier or email
address. <strong>Personalization answers:</strong> your onboarding choices
(goals, obstacles, traits) and any free text you write (such as a life goal
or personal line). <strong>Usage data:</strong> pseudonymous product events
(screens viewed, content ids, streaks, experiment variant) tied to a random
id. <strong>Purchase state:</strong> subscription status from the app
stores via RevenueCat — never your card details. <strong>Device data for
notifications:</strong> push token, platform, timezone, language and
notification preferences. <strong>Crash data:</strong> technical error
reports.</p>

<h2>2. What we do NOT do</h2>
<p>We do not sell personal data, show ads, or track you across other apps.
Your free-text answers and personal goals are stored only in our database
and are never sent to analytics or crash-reporting services.</p>

<h2>3. Why we process data</h2>
<p>To provide the service (contract): accounts, content personalization,
streaks, notifications, purchases. To improve the product (legitimate
interest / consent where required): pseudonymous analytics and A/B tests of
onboarding copy. To keep the app working (legitimate interest): crash
reporting and abuse prevention.</p>

<h2>4. Processors and storage</h2>
<p>We use Supabase (database and authentication, hosted in the EU),
PostHog (analytics, EU region), Sentry (crash reporting, EU region), and
RevenueCat (subscription management, US — receives your account id and
purchase state only), plus Apple/Google push services for notifications.
Each processor is bound by data-processing agreements. RevenueCat
processes data in the United States under the European Commission's
Standard Contractual Clauses.</p>

<h2>5. Retention and deletion</h2>
<p>Data is kept while your account exists. Settings → Account → Delete
account permanently deletes your account, personalization, streaks, saved
content and device records from our systems. Store purchase records remain
with Apple/Google/RevenueCat as required for billing.</p>

<h2>6. Your rights</h2>
<p>Depending on your location (including under the GDPR), you may have the
right to access, correct, export, restrict or delete your personal data, and
to object to processing. Use the in-app deletion, or contact us at
<a href="mailto:${CONTACT}">${CONTACT}</a>. You may also complain to your
local data-protection authority. The data controller is:</p>
${OWNER_BLOCK}

<h2>7. Children</h2>
<p>The app is not directed at children under 13 (or the higher minimum age
in your country), and we do not knowingly collect their data.</p>

<h2>8. Changes</h2>
<p>We will post any material changes here with an updated date.</p>
`,
);

Deno.serve((req) => {
  const path = new URL(req.url).pathname;
  const html = path.endsWith('/privacy') ? PRIVACY : path.endsWith('/terms') ? TERMS : null;
  if (!html) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Future Self</title>` +
        `<p><a href="legal/terms">Terms of Service</a> · <a href="legal/privacy">Privacy Policy</a></p>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
