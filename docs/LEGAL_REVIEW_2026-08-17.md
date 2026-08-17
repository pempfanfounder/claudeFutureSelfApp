# Legal review — Terms of Service & Privacy Policy (2026-08-17)

Scope: audit, benchmark and rewrite of `website/terms/index.html`, `website/privacy/index.html`, plus consistency fixes to `website/support/index.html`, `website/index.html`, `website/404.html` and one CSS rule in `website/styles.css`. Every factual statement in the new pages was checked against the shipping code (`src/`, `supabase/`, `app.json`, `eas.json`, `docs/`) and the live Supabase project (region `eu-west-1`). Legal-status items were re-verified by web research on **17 Aug 2026** (sources in §D and §H).

**This is not legal advice.** Items in §F must be confirmed by a Dutch lawyer / boekhouder before you rely on them. Everything else is, to the best of this review, safe to publish.

---

## G. One-minute summary (read this first)

1. Both documents were rewritten from scratch, GDPR-structured, plain English, and true for the app as it ships (anonymous-first account, hard paywall, EU-hosted Supabase/PostHog/Sentry, RevenueCat + Expo in the US, no ads/tracking/export button).
2. Contact email is `denizsahinbusiness@gmail.com` everywhere; `hello@joinfutureself.com` (used on the live June site) is not set up — add it as an alias later if you want a branded address.
3. Minimum age is now **16** (Dutch digital-consent age; avoids COPPA entirely). The onboarding "Under 18" band should be relabelled "16–17" or soft-gated — see §F.
4. New founder protections: full Apple minimum-EULA terms + Google clause, "as is" disclaimer, liability cap (12-month fees, €100 floor) with EU carve-outs, user indemnity for misuse, IP/licence, service-change and termination rights, force majeure, assignment, severability, notices, and — for **U.S. residents only** — AAA consumer arbitration, class-action waiver, 30-day opt-out, small-claims carve-out, state savings clause.
5. Wellness clause added: not medical advice, research claims are general findings not promises, crisis lines (112/911, 113 & 0800-0113 NL, 988 US).
6. Subscription clause covers auto-renewal (24 h), trial conversion, "deleting the app doesn't cancel", restore, price changes, lifetime definition, refunds via stores, EU withdrawal (Art. 16(m)) and Dutch conformity rights.
7. Privacy Policy now has a category → examples → source → purpose → legal basis → retention table, a sub-processor table with regions and transfer mechanisms, honest retention (until deletion; 12 months analytics; 90 days crash), GDPR rights + AP complaint route, a truthful U.S. state-rights section (no sale/share), children (16), ePrivacy/local-storage and "no cookies on the website".
8. The live June site is materially wrong for the current product (iPad, topics/practice, "no streaks", "no analytics SDKs", export button, free tier, weekly plan, MMKV/keychain, ODR link) — replace it entirely with `website/`.
9. Competitor benchmark (Monkey Taps' shared Terms/Privacy for I Am and Motivation): we adopted their U.S. arbitration structure and sub-processor list; we deliberately did **not** copy their instant-effect changes clause, blanket liability exclusion, one-year claims bar, "any purpose" user-content licence, Florida-law-for-everyone or 18+ terms vs 9+ rating.
10. Before publishing: read §F (11 lawyer/boekhouder items), decide on the 24-month anonymous-account clean-up sentence (implement or delete), and register the arbitration clause with the AAA Consumer Clause Registry if you keep §17 of the Terms.

---

## A. Inaccuracies found and fixed

### A.1 Repo package (`website/`, dated 15 Aug 2026)

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | Terms §3, Privacy §9 | Minimum age 13 ("or higher local age") — vague for NL (16) and leaves COPPA exposure | Age **16** worldwide; parental permission 16–17; children clause rewritten |
| 2 | Terms §4/§12, Privacy §6/§7, Support | Path "Settings → Account → Delete account" does not exist; the screen is titled **Profile** and the row is **Account & subscription** | All paths corrected: Profile → Account & subscription → Delete account; paywall → Privacy choices → Delete my account & data |
| 3 | Support | "Settings → Account → Restore purchases" | Restore on paywall or Profile → Account & subscription → Restore purchases |
| 4 | Support | "iPhone / iPad" — `supportsTablet: false` in `app.json` | "iPhone" |
| 5 | Terms §11 | Apple section had 5 of Apple's 10 minimum-EULA points; no Google Play sentence | All 10 Apple points (acknowledgement, scope, maintenance, warranty, product claims, IP, legal compliance, developer contact, third-party terms, third-party beneficiary) + Google clause |
| 6 | Terms | No crisis-line pointer, no science-claim qualifier, no indemnity, no assignment / force majeure / severability / entire agreement / notices / survival, no U.S. arbitration or state savings clause | Added (§3, §15, §17, §18) |
| 7 | Terms §6 | Withdrawal clause ignored that Apple/Google are seller of record and did not mention Dutch conformity rights (7:50aa BW) | Rewritten §7 |
| 8 | Terms §12 | Changes clause: "announce it in the app or on this page" with continued-use acceptance — weak under UCTD / 6:237 BW | Reasonable advance notice, change not effective before notice period, right to cancel; express consent where law requires |
| 9 | Privacy §5 | Processor list omitted Expo (US push relay), Netlify (website), Apple/Google as independent controllers, Resend (conditional); no transfer mechanism for Expo; no regions | Full table with role, categories, region, mechanism |
| 10 | Privacy §2/§6 | No retention periods; no U.S. section; no ePrivacy/local-storage statement; no "website sets no cookies"; analytics description omitted device model and IP-derived approximate location; no honest statement about the missing analytics toggle | Added table column + §6, §8, §12, §13 |
| 11 | All pages | Identity details were still wrapped in `<mark class="todo">` (loud yellow placeholder style) although filled | Removed on every page; footer now shows KVK + BTW-id |
| 12 | Privacy §2 | Said usage events are tied to "a random identifier rather than your name" — true, but it is the Supabase account UUID (same as the account), so "pseudonymous, tied to your account identifier" is the accurate wording | Reworded |
| 13 | Support | No FAQ for access/export/objection requests, no "new phone" answer, no crisis note | Added |

Additional repo finding (not changed — outside `website/`): `supabase/functions/legal/index.ts` still serves an older (10 Aug) Terms/Privacy at the `*.supabase.co/functions/v1/legal` URL. `src/lib/legal.ts` points the app at joinfutureself.com, so the edge function is dormant; delete it or keep it in sync to avoid two conflicting versions being discoverable.

### A.2 Live site at joinfutureself.com (13 June 2026, "pre-publication")

| # | Claim on live site | Reality in the shipping app | Consequence |
|---|---|---|---|
| 1 | Contact `hello@joinfutureself.com` | Not set up; founder confirmed `denizsahinbusiness@gmail.com` | Replaced everywhere (alias later, optional) |
| 2 | "iPhone · iPad" | iPhone-only (`supportsTablet: false`) | Removed |
| 3 | "topic-based practice", "Repeat out loud 3×", "Read three times, out loud", "practice flows", "topic taxonomy and pack organisation", "collections you create and name", "followed topics" | None of these features exist | Removed; service description rewritten (§2 Terms) |
| 4 | "No streaks to defend, no leaderboards" | The app has a daily 3-item streak (no leaderboards is true) | Removed |
| 5 | Landing page: "no analytics SDKs, no behavioral tracking … stays on your device" | PostHog + Sentry are used (the live Privacy Statement itself says so) — the landing page contradicts it | Landing page is now legal-only; policy describes analytics honestly |
| 6 | "Export your data … Settings → Account → Export my data" (index, support, privacy §12) | No export feature exists | Replaced with "email us for a copy/export" |
| 7 | "Some features are free … free tier … Free to try, with a calm subscription" | Hard paywall; only a store free trial | Terms §6 rewritten |
| 8 | "weekly, monthly and yearly" subscriptions | Yearly (3-day trial), monthly, lifetime; no weekly product | Fixed |
| 9 | Security: "Encrypted MMKV … key in OS keychain (expo-secure-store) … auth tokens in keychain" | `expo-secure-store` was removed (LAUNCH_CHECKLIST blocker 5); session is in AsyncStorage inside the app sandbox | Honest wording in Privacy §10 |
| 10 | App Group `group.com.forthefutureself.app` | `group.com.futureself.mobile` | Not named in the new text |
| 11 | Retention table: "removed within 30 days", "push tokens 6 months inactivity", "sent push records 90 days", "purchase data 7 years (Art. 52 AWR)" | Deletion is immediate (FK cascade from `auth.users`); no purge jobs exist; we do not hold invoices (Apple/Google/RevenueCat do) | Truthful retention in Privacy §2/§6 |
| 12 | EU ODR platform link | Platform discontinued 20 July 2025 (Reg. (EU) 2024/3228) | Removed; note added |
| 13 | Zoho as email processor; "12+" age rating; UK/ICO paragraphs; "balancing assessment record available on request" | Zoho not used; rating still to be set (checklist targets 4+); no LIA document exists yet | Removed (see §F item 7 for the LIA) |
| 14 | Onboarding categories "life season", "blocker patterns" | Current funnels collect goals, obstacles, motivation, traits, topics, beliefs, habits, streak goal, practice modes, icon, "how did you find us", free-text life goal / own line / good-and-wasted-day (Stella variants), age band or typed age, gender (some variants) | Privacy table row C rewritten from `completeOnboarding.ts` + variants |
| 15 | Push payloads "contain only the daily affirmation or quote text" | Also streak reminders, trial-ending reminders, campaign messages; payload carries content id + deep link | Privacy §11 |
| 16 | Sign-in "Apple, Google or email one-time code" as the entry point | Anonymous-first; email OTP gated off (`EXPO_PUBLIC_EMAIL_AUTH_ENABLED`) | Terms §5, Privacy row A ("where offered") |
| 17 | Age "16, or 13 in EU countries with a lower age" | Simplified to 16 everywhere | — |

---

## B. Competitor benchmark

Fetched 17 Aug 2026. Monkey Taps LLC uses **one shared** Terms of Use and Privacy Policy for both apps: <https://monkeytaps.net/terms> and <https://monkeytaps.net/privacy> (both "Last updated July 24, 2026"; identical copies at monkeytaps.app and motivation.app). Older, undated EU-style documents survive on the app marketing sites (theiam.app / motivation.app "Contract conditions" and "Application terms of use & privacy policy"; iamaffirmations.app/terms dated 29 Sep 2023) and a stale 2014 policy at iamaffirmations.app/privacy. The App Store pages (id874656917, id876080126) carry Apple's auto-renew boilerplate in the description and link to the shared documents. motivationapp.com did not resolve.

| Clause | I Am (shared MT docs) | Motivation (same docs) | Future Self — before (15 Aug repo) | Future Self — after |
|---|---|---|---|---|
| Auto-renewal wording | Terms silent; only App Store description ("charged to your iTunes Account… renew unless cancelled 24 h before") | Same | 24 h rule, cancel in store, deleting app ≠ cancel | Same + charge timing, restore, price change, lifetime definition, trial-reminder caveat, both store paths |
| Free-trial disclosure | None in Terms (older doc: 3-day trial, cancel before end) | Same | Trial converts unless cancelled | Same + reminder caveat, forfeiture on lifetime purchase, "for new subscribers" |
| Refunds | None in Terms; FAQ says non-refundable, store decides | Same | Store handles | Store handles + EU withdrawal + Dutch conformity |
| Medical / wellness disclaimer | None (generic "reliance on information" only); no crisis line despite "help for depression / reduce anxiety" marketing | Same | Short "not professional advice" | Full §3 incl. research-claim qualifier, "not a medical device", crisis lines |
| IP / licence | Company owns; revocable non-exclusive licence; personal use | Same | Similar | Same + database right, no ML training, share-a-card allowance |
| User-content licence | Contributions "non-confidential"; licence "for any purpose… disclose to third parties" | Same | Limited service licence | Limited, purpose-bound, ends on deletion; private, no ads/ML |
| Warranty disclaimer | "AS IS" caps, all implied warranties | Same | "As is", EU carve-out | Same, with explicit EU conformity carve-out |
| Limitation of liability | No damages of any kind (incl. direct, personal injury), no cap, **1-year claims bar** | Same | Indirect excluded; cap = 12-month fees; NL carve-outs | Indirect excluded; cap = greater of 12-month fees / €100; NL/EU carve-outs; state savings |
| Indemnification | Broad, all affiliates/service providers | Same | None | Fault-based, consumer-limited |
| Arbitration / class waiver | AAA Consumer Rules, Miami-Dade or user's county, 30-day informal notice, small-claims + IP carve-out, class & jury waiver, MT pays fees beyond filing fee, 30-day opt-out, mass-arbitration bellwether | Same | None | U.S.-residents-only §17: same structure (AAA, informal 30 days, small claims, class waiver, opt-out, fees), no bellwether |
| Governing law / venue | Florida / Miami-Dade for everyone (older doc: consumer's own country) | Same | Dutch law, consumer protection kept | Dutch law, Rotterdam court, EU consumer home-court rule, FAA for U.S. arbitration |
| Minimum age | 18+ (store rating 9+) | Same | 13 | 16 (parental permission 16–17) |
| Changes to terms | "effective immediately when we post them" | Same | Post + continued use | Advance notice, not effective before notice period, right to cancel |
| Contact / DMCA | Miami address, email; refers to a non-existent "Copyright Policy", no DMCA agent | Same | KVK/BTW/address/email | Same; no DMCA agent (no public UGC — nothing to host) |
| Privacy structure | COPPA → data → uses → disclosures → rights → state rights → security → retention → GDPR block | Same | 11 short sections | 15 sections incl. data table, processor table, transfers, U.S. rights, ePrivacy |
| Third parties named | Google, Mixpanel, AWS, Typeform, Notion, Slack, Apple, **Meta, TikTok**, Supabase, RevenueCat, Stripe; admits behavioural ads and LLM training | Same | Supabase, PostHog, Sentry, RevenueCat, Apple/Google push | Supabase (IE), PostHog (DE), Sentry (DE), RevenueCat (US), Expo (US), Apple, Google, Netlify, Resend (conditional) — with regions & mechanisms |
| CCPA / U.S. rights | Generic "state privacy rights", GPC honoured, no Do-Not-Sell link despite Meta/TikTok | Same | None | Truthful: below thresholds, no sale/share, rights honoured, appeal |
| Children | COPPA <13 | Same | <13 | <16 (+ COPPA note) |
| Retention | "as long as reasonably necessary" | Same | "as long as account exists" | Per-category table + clean-up rule |
| Health/science claims on site | "rewire our brains", "reduce stress and anxiety", "help for depression" — no disclaimer | Same | — | App claim ("Studies show… well-being") qualified in Terms §3; see §F item 8 |

---

## C. What we adopted, what we did not

**Adopted (from Monkey Taps' current docs):** U.S. arbitration architecture (AAA Consumer Rules, informal-resolution period, small-claims carve-out, class waiver, opt-out, business pays fees beyond the filing fee); a named sub-processor list; explicit "we do not sell/share" statement; state-rights section with an appeal route. **Adopted (from their older EU-style doc):** 24-hour charge-timing sentence, trial-end cancellation wording, consumers keep home-country law and courts. **Kept from the live June site:** GDPR skeleton (controller, purposes/legal bases, processors, transfers, retention, rights, complaint, children, push, local storage), the Article 22 "recommendation, not automated decision" line, the "please don't enter special-category data" caution, the ADR statement.

**Deliberately not copied, with reasons:**
- "Changes effective immediately on posting" — unfair term for EU consumers (UCTD Annex 1(j); 6:237(c) BW); we give notice + cancellation right.
- Blanket exclusion of all damages incl. personal injury/direct loss, and a one-year time bar — void for consumers (6:236/6:237 BW; UCTD); we cap with mandatory carve-outs.
- Florida law + Miami venue + arbitration for everyone — unenforceable against EU consumers (Rome I Art. 6, Brussels I-bis Art. 17–19; UCTD Annex 1(q)); we scope arbitration to U.S. residents only.
- User-content licence "for any purpose… disclose to third parties" — disproportionate for a private goal/affirmation; ours is purpose-bound.
- 18+ terms while the store rating is 9+ — inconsistent; we chose 16 and flag the app's age band.
- Consent-by-use, "notify by updating the date", LLM-training clause, ad-tech SDKs (Meta/TikTok), "Data isn't encrypted / can't be deleted" store labels — either untrue for us or bad practice.
- Mass-arbitration "bellwether" procedure — plausible protection but adds complexity a solo founder is unlikely to need; a lawyer can add one later.
- No DMCA agent designation — Future Self hosts no public user content, so §512 safe harbour is not in play; a takedown contact is the normal email.

---

## D. Compliance checklists

Legend: ✅ addressed in the documents · ⚠️ addressed but needs the action in brackets · ➖ not applicable.

### D.1 EU / Netherlands

| Item | Status | Where |
|---|---|---|
| Controller identity, address, KVK, BTW-id, email (GDPR 13(1)(a); CRD 6(1)(b)-(c); DSA trader info) | ✅ | Privacy §1, Terms §19, footers |
| Purposes and legal bases per purpose (13(1)(c)); legitimate interests named (13(1)(d)) | ✅ | Privacy §2 table, §4 |
| Recipients / processors, regions (13(1)(e)) | ✅ | Privacy §5 |
| Third-country transfers + safeguards (13(1)(f), Ch. V) — SCCs 2021/914; DPF where certified | ⚠️ (confirm DPAs/SCC modules on file; check RevenueCat DPF status — §F.6) | Privacy §5 |
| Retention periods or criteria (13(2)(a)) | ⚠️ (24-month anonymous clean-up: implement or delete the sentence — §F.9) | Privacy §2, §6 |
| Data-subject rights, withdrawal of consent, complaint to AP (13(2)(b)-(d)) | ✅ | Privacy §7 |
| Automated decision-making statement (13(2)(f)) | ✅ none with legal effects | Privacy §3 |
| Children — NL consent age 16 (art. 5 UAVG) | ⚠️ (app age band "Under 18" — §F.2) | Privacy §9, Terms §4 |
| ePrivacy Art. 5(3) / Tw 11.7a — local storage strictly necessary; website no cookies | ✅ | Privacy §13 |
| Analytics without consent (LI + Tw 11.7a(3) limited-impact analytics) | ⚠️ (write a short LIA; consider in-app toggle — §F.7) | Privacy §4, §12 |
| Push notifications — OS consent, withdrawal, content described | ✅ | Privacy §11 |
| Breach notification commitment (Art. 33/34) | ✅ | Privacy §10 |
| Art. 27 representative / DPO — not required (established in NL; small scale) | ✅ stated | Privacy §1 |
| CRD Art. 6 pre-contract info: price incl. taxes shown in store, duration/termination, functionality, withdrawal + Art. 16(m) exception, ADR status | ✅ | Terms §6, §7, §16 (+ paywall disclosure in-app) |
| Withdrawal: express request + acknowledgement (16(m)); Art. 8(7) durable-medium confirmation comes from the store receipt | ⚠️ (lawyer confirm interplay with Apple/Google as seller of record — §F.10) | Terms §7 |
| Digital content conformity (Dir. 2019/770; 7:50aa ff. BW), updates duty | ✅ | Terms §2, §7, §13 |
| Unfair terms: no unilateral change without notice, no liability exclusion for intent/gross negligence/personal injury, no arbitration for EU consumers, consumer home-court | ✅ | Terms §12, §14, §16, §17 (US-only) |
| Choice of Dutch law + Rotterdam court with consumer protection preserved (Rome I 6; Brussels I-bis 18) | ✅ | Terms §16 |
| ODR link removed (Reg. 2024/3228, platform closed 20 Jul 2025); ADR non-participation stated | ✅ | Terms §16 |
| DSA trader declaration in App Store Connect / Play Console (name, address, phone, email published) | ⚠️ owner action (LAUNCH_CHECKLIST §B) | — |
| Apple minimum EULA terms (10 points) | ✅ | Terms §11 |

### D.2 United States

| Item | Status | Where |
|---|---|---|
| FTC Act §5 — truthful, substantiated claims; research references qualified; results not promised | ⚠️ (soften "Improve mental health" bullet in onboarding — §F.8) | Terms §3, §13 |
| FTC Click-to-Cancel rule — vacated by 8th Cir. 8 Jul 2025; ANPRM Mar 2026; no federal rule in force (ROSCA + §5 remain) | ✅ no reliance; ROSCA-style clear disclosure + consent + easy cancel via store | Terms §6, §17 |
| California ARL (as amended by AB 2863, eff. 1 Jul 2025): pre-purchase disclosure, affirmative consent, acknowledgment, online cancel, trial/renewal reminders, annual reminder | ⚠️ store handles consent/receipt/online cancel; our paywall carries the disclosure; annual reminders/trial reminders — confirm store coverage (§F.11) | Terms §6, §17 |
| New York GBL §527-a (amended, eff. 5 Nov 2025) — same family of duties | ⚠️ as above | Terms §6, §17 |
| Other states with pre-renewal reminder duties (MN, UT, AR, CO, MA, CT 7/2026, MD 6/2026, VA 7/2026) | ⚠️ as above | — |
| COPPA (<13; amended Rule effective 23 Jun 2025, compliance 22 Apr 2026) — not directed at children; no knowing collection | ✅ | Privacy §9 |
| CCPA/CPRA thresholds ($26.625M revenue / 100k consumers / 50% revenue from selling) — not met; truthful "no sale/share" section; rights honoured; appeal (VA/CO-style) | ✅ | Privacy §8 |
| Arbitration: mutual, AAA Consumer Rules, informal step, small-claims carve-out, class waiver, opt-out 30 days, business pays fees, FAA, severability of waiver | ⚠️ (enforceability review + AAA Consumer Clause Registry — §F.1) | Terms §17 |
| Jury-trial waiver, court venue fallback | ✅ | Terms §17 |
| State savings clause (NJ, CA, others) | ✅ | Terms §17 |
| Warranty disclaimer in conspicuous form; limitation of liability | ✅ | Terms §13, §14 |
| Crisis line (988) | ✅ | Terms §3, Support |
| DMCA agent | ➖ no public UGC | — |
| Apple minimum EULA / Google Play terms | ✅ | Terms §11 |

---

## E. Founder-protection clauses added

- Wellness / not-medical-advice / not-a-medical-device / research-claims-are-general / crisis pointers (Terms §3) — directly addresses the onboarding "Studies show…" and "Improve mental health" screens.
- Licence-not-sale, IP ownership incl. database right, no scraping/ML training, share-a-card allowance (§8).
- Purpose-bound user-content licence that ends on deletion (§9) — protects you while keeping the "your words stay yours" promise.
- Acceptable-use list incl. paywall/entitlement bypass, infrastructure abuse (§10).
- All ten Apple minimum-EULA points + Google Play sentence, third-party-services outage carve-out (§11).
- Right to change/retire features and to change the Terms with notice; suspension/termination for breach; discontinuation with notice; survival (§12).
- "As is / as available" disclaimer with only the mandatory carve-outs (§13).
- Liability: no indirect/consequential; cap = greater of 12-month fees or €100; explicit exclusion of "missed notification" claims; mandatory carve-outs (§14).
- Fault-based indemnity for misuse/third-party claims (§15).
- Dutch law, Rotterdam court, informal-first (§16); U.S.-only arbitration + class waiver + jury waiver + opt-out + state savings (§17).
- Entire agreement, severability, no waiver, assignment to a successor, force majeure (incl. Apple/Google outages), notices by app/site/email, English prevails (§18).
- Privacy side: honest scope limits ("we may not be able to identify an anonymous account"), retention rule for abandoned anonymous accounts, "no in-app analytics switch" disclosure (avoids an unfair-practice claim), transfer mechanisms named.

---

## F. Confirm with a lawyer / boekhouder before relying on it

1. **U.S. arbitration clause (Terms §17)** — enforceability of the mutual clause, opt-out and class waiver as drafted; whether to add a mass-arbitration procedure; and **registration of the clause on the AAA Consumer Clause Registry** (AAA charges a review/registration fee and may decline to administer unregistered clauses). If you prefer not to pay/maintain this, delete §17 and let the Dutch-law/home-court clause apply worldwide.
2. **Minimum age 16** — confirm the choice (alternative: 13 with parental consent under 16 in the EU) and, in the app, either relabel the "Under 18" age band to "16–17" or add a soft gate ("Future Self is for people 16 and over") in `src/features/onboarding/variants/iamClaude.ts` (not changed in this pass — `src/` was out of scope).
3. **Liability cap** — 12-month fees with a €100 floor; confirm the floor is sensible under 6:237(f) BW (grey list) and Dutch case law for a ~€60/year product.
4. **VAT / BTW** — Apple (Apple Distribution International, IE) and Google are merchant of record: confirm reverse-charge B2B treatment, opgaaf ICP, no OSS registration needed, and whether the KOR (kleineondernemersregeling) interacts badly. Confirm the BTW-id shown publicly is the correct one to disclose.
5. **Trade name and address** — confirm "Improvement Labs" and Van der Poelstraat 57C exactly match the KVK extract; decide whether you want a home address on public pages (a business/post address is allowed if registered) — the same address goes into the App Store DSA trader declaration.
6. **Data-processing agreements and transfers** — confirm signed/accepted DPAs with Supabase, PostHog, Sentry, RevenueCat, 650 Industries (Expo), Netlify and Resend; confirm the SCC module in each; check RevenueCat's DPF status on <https://www.dataprivacyframework.gov/list> (its policy/DPA cite SCCs only); Expo/PostHog/Sentry state DPF certification. Note the CJEU appeal in *Latombe* (C-703/25 P) is pending — DPF is valid today.
7. **Analytics legal basis** — PostHog/Sentry initialise before any consent (`src/app/_layout.tsx`). We rely on legitimate interest + the Dutch limited-impact-analytics exemption (Tw 11.7a(3)). Have a lawyer confirm; write a one-page legitimate-interest assessment; and consider a 20-line in-app "Share anonymous usage data" toggle (`posthog.optOut()`) so the objection right is self-service.
8. **Health / science claims in onboarding** — "Studies show daily self-affirmation boosts self-confidence, resilience and overall well-being" (cited to Cohen & Sherman 2014; Cascio et al. 2016) and the benefit bullet "Improve mental health" / goal "Improve my mental health". FTC §5 and the Dutch ACM require competent and reliable evidence for health-benefit claims. Recommend softening to "support your mental well-being" and keeping the citations; the Terms already qualify the claims.
9. **Retention sentence** — Privacy §6 says abandoned anonymous accounts (no sign-in, no purchase, no activity 24 months) "may be deleted in periodic clean-ups". Either implement it (a `pg_cron` job or a manual quarterly SQL) or delete the sentence.
10. **Right of withdrawal** — confirm the drafting in Terms §7 given Apple/Google are seller of record (Apple Media Services Terms NL: 14-day cancellation lapses once delivery starts with acknowledgement; Google: subscriptions keep 14-day withdrawal). Confirm no separate Art. 8(7) durable-medium confirmation is required from us beyond the store receipt.
11. **U.S. auto-renewal laws** — California ARL (AB 2863) and NY GBL 527-a require annual/pre-renewal and trial-end reminders and same-medium cancellation. Apple/Google handle consent, receipts and online cancellation; confirm they satisfy the reminder duties for a $59.99/yr plan with a 3-day trial (our push reminder is a bonus, not a legal reliance) — and whether the App Store Connect "reminders" settings should be enabled.
12. **UK** — if the app is sold in the UK, UK GDPR may require a UK representative (Art. 27 UK GDPR) unless processing is occasional/low-risk; UK consumer law (CRA 2015, DMCC Act 2024 subscription rules from 2026) may need a short UK paragraph.
13. **Insurance** — beroeps-/bedrijfsaansprakelijkheidsverzekering (professional/business liability) covering worldwide app distribution and U.S. claims; check whether the arbitration/limitation clauses are conditions of cover.
14. **Indemnity vs consumers (Terms §15)** — drafted fault-based and consumer-limited; confirm it is not on the Dutch grey list as applied.
15. **Acceptance mechanism** — confirm the welcome screen shows "By continuing you agree to the Terms and Privacy Policy" with links (a clickwrap/browsewrap question for U.S. enforceability, especially of §17).

---

## H. Sources checked (17 Aug 2026)

- FTC Negative Option Rule vacatur (8th Cir., 8 Jul 2025) and ANPRM (Fed. Reg. 13 Mar 2026): crowell.com client alerts; cooley.com 19 Mar 2026; ftc.gov press release Mar 2026.
- California AB 2863 (leginfo.legislature.ca.gov); Cooley 4 Jun 2025; Barnes & Thornburg 2025.
- NY GBL §527-a text (nysenate.gov) and Kelley Drye / Perkins Coie 2025 alerts; other state ARL round-ups (Kelley Drye, ZwillGen, GT Law, leg.colorado.gov, 940 CMR 38.05).
- ODR shutdown: consumer-redress.ec.europa.eu; Reg. (EU) 2024/3228; ADR Directive 2013/11/EU and Directive (EU) 2025/2647.
- NL consent age 16: art. 5 UAVG (avghelpdeskzorg.nl; legiscope.com).
- Crisis lines: samhsa.gov/988; 113.nl (113 and 0800-0113).
- Apple minimum EULA terms: apple.com/legal/internet-services/itunes/dev/minterms/; Apple Media Services Terms NL (updated 15 Sep 2025); Google Play refund/EEA page (support.google.com/googleplay/answer/15576634); Google DDA.
- DPF status and *Latombe* appeal (twobirds.com; wilmerhale.com); vendor policies expo.dev/privacy, posthog.com/privacy, sentry.io/privacy, revenuecat.com/dpa, supabase.com/privacy.
- AAA Consumer Arbitration Rules (rev. 1 May 2025) & fee schedule summaries (adr.org; McGlinchey); JAMS Consumer Minimum Standards.
- CRD Art. 6/16(m) (EUR-Lex 32011L0083; Commission Guidance 2021/C 526/02); Dutch Book 7 Title 1AA (Stb. 2022, 164); 6:236/6:237 BW.
- COPPA amended Rule (Fed. Reg. 22 Apr 2025); CCPA thresholds (cppa.ca.gov CPI adjustment, eff. 1 Jan 2025).
- Autoriteit Persoonsgegevens postal address (autoriteitpersoonsgegevens.nl; rijksoverheid.nl).
- PostHog retention (posthog.com/pricing: 1 year free / 7 years paid); Sentry retention (sentry.zendesk.com: 90 days on standard plans).
- Monkey Taps documents: monkeytaps.net/terms, monkeytaps.net/privacy (24 Jul 2026), iamaffirmations.app/terms (29 Sep 2023), theiam.app & motivation.app contract-conditions pages, App Store ids 874656917 / 876080126, Play `com.hrd.iam` / `com.hrd.motivation`.

## Notes on length and style

- Terms: ~4,600 words including the summary box, table of contents, Apple's ten mandatory clauses (~450 words) and the U.S. section (~600). The operative EU body is ~3,300 words. Privacy: ~3,550 words including two tables. Both keep the existing HTML skeleton, nav, `styles.css` classes and TOC pattern; one CSS rule (`.table-wide`) was added for the six-column table.
- All five pages pass a tag-balance and internal-anchor check; no `mark.todo` placeholders remain.
