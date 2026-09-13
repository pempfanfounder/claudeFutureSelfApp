// legal: single-source redirect for the Terms of Service and Privacy Policy.
//
// The only maintained copy of both documents is the static website in
// `website/` (deployed to https://joinfutureself.com). This function used to
// serve its own, older HTML copy; that duplicate drifted from the website and
// is gone. Any link that still points at
// `…/functions/v1/legal/{terms,privacy}` (old store listings, OAuth consent
// screen, cached links) is redirected to the website so there is exactly one
// version of each document.
//
// Deploy with --no-verify-jwt (public URL).

const SITE = "https://joinfutureself.com";

const TARGETS: Record<string, string> = {
  terms: `${SITE}/terms/`,
  privacy: `${SITE}/privacy/`,
  support: `${SITE}/support/`,
};

Deno.serve((req) => {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const location = TARGETS[last] ?? `${SITE}/`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "public, max-age=3600",
    },
  });
});
