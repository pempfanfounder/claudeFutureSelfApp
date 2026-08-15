FUTURE SELF — LEGAL SITE: DEPLOY IN 5 MINUTES
1. Drag this whole folder (or futureself-legal-site.zip) onto https://app.netlify.com/drop — the site is live seconds later on a *.netlify.app URL.
2. Netlify > Domain settings > Add custom domain: joinfutureself.com. At Porkbun, set the DNS records Netlify shows you (apex A record 75.2.60.5, CNAME www -> your-site.netlify.app), then let Netlify issue HTTPS.
3. BEFORE going live: replace every amber [... INVULLEN] placeholder — KVK-nummer, BTW-id and business address — in terms/index.html, privacy/index.html and the footer of every page.
4. Update the two URLs in src/features/paywall/PaywallFooter.tsx (TERMS_URL, PRIVACY_URL) to https://joinfutureself.com/terms/ and https://joinfutureself.com/privacy/.
5. In App Store Connect, set Privacy Policy URL = https://joinfutureself.com/privacy/ and Support URL = https://joinfutureself.com/support/.
