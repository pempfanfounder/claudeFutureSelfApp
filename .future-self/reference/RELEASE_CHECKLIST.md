# Release evidence checklist — no prechecked approvals

Maintain a dated requirement/applicability/source/evidence/blocker ledger in RELEASE. Recheck actual requirements on submission day; this file is a test plan, not legal or platform advice certifying the app.

Candidate: full SHA/dirty patch identity; version/build; archive and EAS identifiers/profile; iOS bundle/team/signing; widget extension/app group; effective public-key classes; runtime/native dependency support; backend/migration/function versions; offerings/products/flags; exact TestFlight identity. Substantive drift goes through implementation/QA again.

Production: correct Supabase target/schema/RLS/grants/functions/secrets, no service secrets embedded client-side; store-backed RevenueCat app/entitlements/products/webhooks and tested lifecycle; auth/link/recovery and email; APNs/Expo push/cron/receipts; widget extension provisioning; Sentry release/source maps/redaction; analytics actual fields/destination/consent; quotas/limits/alerts and stop controls. No production load tests or unsolicited real charges.

Native/toolchain: current Apple upload SDK/Xcode requirements, actual minimum-supported iOS, capabilities/entitlements, icons, launch/safe areas, device families, privacy manifests/required reasons/SDK signatures, permission strings and data handling. Do not equate a deployment target with SDK upload eligibility.

Store-facing: actual candidate screenshots and accurate metadata, terms/privacy/support URLs, account deletion accessibility including guests, subscription disclosures/trial eligibility/reminder accuracy/restore, no development mocks or unapproved overrides, reviewed content/IP licenses, review access and useful notes, subscription metadata/review status, current age questions and truthful product claims.

Account owner: confirmed legal name/entity/contact, business/trader status as applicable, approved storefronts/ages/prices, tax/banking/agreements and encryption/privacy/tracking answers. Record unverified legal applicability; seek qualified advice for unresolved legal matters. EU establishment/data processing and U.S. sales do not collapse into one jurisdictional rule.

Packaging: inspect actual archive/upload file selection, existing .easignore and Git behavior; exclude workflow prompts, install ZIP, private checkpoint/evidence/backups, credentials not required in their approved secure mechanism, and prototypes. Do not overwrite ignore configuration or delete user files to achieve this. Build once per intended candidate rather than using every available tool.

Gates: R1 build/upload approved; TestFlight processed; exact-candidate physical-device/store acceptance and bounded production smoke passed; R2 review submission explicitly approved; Apple review status recorded; R3 public release explicitly approved after Apple approval; intended storefront availability and installed-build smoke verified. Manual release by default. Record pending external work honestly and wait for a new user invocation to check again.

Handoff: incident/support/deletion owner, alert destination, spend/retry/queue controls, emergency disable for costly optional work, purchase-entitlement support, privacy/security escalation and corrective-release plan. Native binary replacement is not instant rollback. Store availability alone does not prove reliable installed behavior.

## Official starting points — re-open at execution
- Apple Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple upcoming requirements: https://developer.apple.com/news/upcoming-requirements/
- App privacy: https://developer.apple.com/app-store/app-privacy-details/
- Account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- App Store Connect help: https://developer.apple.com/help/app-store-connect/
- Expo iOS submission: https://docs.expo.dev/submit/ios/
- Expo EAS environments: https://docs.expo.dev/eas/environment-variables/
- RevenueCat Test Store: https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store
- RevenueCat webhooks: https://www.revenuecat.com/docs/integrations/webhooks
- Supabase anonymous auth: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase billing: https://supabase.com/docs/guides/platform/billing-on-supabase
- EU data protection: https://europa.eu/youreurope/business/dealing-with-customers/data-protection/data-protection-gdpr/index_en.htm

These links are reference entry points, not a claim that their entire contents were rechecked while packaging. Open the relevant current primary sources in the authorized audit/release stage.
