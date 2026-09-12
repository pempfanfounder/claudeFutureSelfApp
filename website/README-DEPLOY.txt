FUTURE SELF — LEGAL SITE: DEPLOY IN 5 MINUTES
1. Drag this whole folder (or futureself-legal-site.zip) onto https://app.netlify.com/drop — the site is live seconds later on a *.netlify.app URL.
2. Netlify > Domain settings > Add custom domain: joinfutureself.com. At Porkbun, set the DNS records Netlify shows you (apex A record 75.2.60.5, CNAME www -> your-site.netlify.app), then let Netlify issue HTTPS.
3. Identity details (KVK 42039945, BTW NL005448561B16, address) are already filled in — just sanity-check them on the Terms and Privacy pages.
4. Nothing to change in the app: it already links to https://joinfutureself.com/terms and https://joinfutureself.com/privacy (src/lib/legal.ts — welcome screen, paywall footer and Privacy choices sheet); /support is the App Store Connect support URL (step 5). Those links only work once steps 1–2 are done, so deploy the site + custom domain BEFORE submitting to App Review (the reviewer follows the Privacy link).
5. In App Store Connect, set Privacy Policy URL = https://joinfutureself.com/privacy/ and Support URL = https://joinfutureself.com/support/.
