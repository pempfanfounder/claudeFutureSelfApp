# Founder brief — supplied goals, not an approved implementation

The founder wants the existing Future Self Expo/React Native app to feel genuinely premium and credible enough for a life-improvement product. The app's messages are framed as guidance from a successful future self, not merely a random motivational feed. Apple, ChatGPT iOS and Grok exemplify the desired level of craft.

The founder requested: first see different native animations for Settings and feed interactions, choose, then implement consistently; assess the wider UI/UX; inspect bugs, privacy/App Store readiness and billing abuse; verify every actual service integration including Supabase, RevenueCat, Sentry and analytics; test thoroughly on multiple iPhones; produce a fix plan before implementing new fixes; retest; then prepare and ship through Xcode/EAS/App Store Connect with the applicable approvals.

The founder is EU-based, expects mostly U.S. customers, and is not an experienced infrastructure engineer. They are willing to log in to relevant services and grant appropriate Mac access, but that is not blanket authority for production changes, payments or public release.

Their latest workflow preference: one ZIP plus one setup prompt; installation only; one simple repeatable message; no manual prompt/file/context management; clear human gates. Do not force separate ChatGPT/Astra/Codex handoffs. The assistant is the coordinator.

## Discovery questions only after inspecting current code
Ask at most three per round, prioritized by which decisions unblock work. Do not repeat known EU/U.S./premium goals.

1. The public content path is a curated quote/affirmation library and daily selection. Is launch about refining that voice/content, or is an additional generative feature explicitly intended? Recommend stabilizing the existing product before adding a new paid dependency unless the promise requires it.
2. Which existing onboarding variants/experiments are meant to ship, be retained but disabled, or be deferred? Inspect variant selectors and actual flags first; do not assume all four must stay.
3. What approved monthly/yearly/lifetime products and trial/reminder behavior should ship? What must unpaid/lapsed users retain access to? Inspect current offerings before asking what the founder already configured.
4. Which features, copy, typography, colors and emotional tone are nonnegotiable? What is known to be unfinished? Show examples from the actual app later instead of abstract design questionnaires.
5. Resolve target ages, exact storefronts, intended launch scope, practical device access, test identities/budget, and monthly infrastructure exposure tolerance.
6. Obtain legal/company/support/processor facts only when relevant. Unverified existing legal text is not founder confirmation. Do not ask for secrets in chat.

Separate verified facts, founder decisions, proposals and unknowns. A source-file product name or trial duration does not by itself approve it for launch.
