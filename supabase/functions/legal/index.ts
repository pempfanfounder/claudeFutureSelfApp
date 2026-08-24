// legal: redirects the retired Supabase-hosted legal pages to the
// canonical site at joinfutureself.com.
//
// This function used to render its own copy of the Terms and Privacy
// Policy. That copy went stale (August 10 2026 text, a Gmail contact
// address, an "under 13" minimum age) and directly contradicted the
// shipping policy on the website, which states a 16+ minimum and
// hello@joinfutureself.com. Two live, conflicting privacy policies is a
// review and compliance problem, so the body is gone rather than
// maintained in two places.
//
// The URL itself has to keep working: it is still referenced from the
// Play Console privacy-policy field and the Google OAuth consent screen
// until both are repointed, and from any build already in a tester's
// hands. 302 (not 301) so nothing caches the redirect permanently while
// those references are still being moved.
//
// Deploy with --no-verify-jwt (public pages).

const SITE = 'https://joinfutureself.com';

const TARGETS: Record<string, string> = {
  terms: `${SITE}/terms/`,
  privacy: `${SITE}/privacy/`,
  support: `${SITE}/support/`,
};

Deno.serve((req) => {
  const path = new URL(req.url).pathname;
  // Paths arrive as /legal, /legal/terms, /legal/privacy — match the
  // last non-empty segment so both the bare and nested forms work.
  const segment = path.split('/').filter(Boolean).pop() ?? '';
  const target = TARGETS[segment] ?? SITE;

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // Short cache only: these targets are stable, but the redirect is
      // a migration aid, not a permanent part of the URL space.
      'Cache-Control': 'public, max-age=300',
    },
  });
});
