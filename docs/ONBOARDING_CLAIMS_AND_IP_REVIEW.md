# Onboarding claims and IP review (2026-08-21)

Scope: (A) verification of the onboarding science claims against the cited literature; (B) similarity and IP-risk audit of the `iam-claude` onboarding versus "I Am - Daily Affirmations" (Monkey Taps). Read-only review; no code changed. All repo strings quoted below were read from `src/features/onboarding/variants/iamClaude.ts` and related components on 2026-08-21 between 10:57 and 11:05 (+07). Another agent was editing that file during the review (one cosmetic change observed, noted in A.0); re-verify exact strings before acting. All external sources were fetched or searched on 2026-08-21; URLs and access notes are listed at the end of each section.

**This is not legal advice.** Section B is risk analysis for a founder; a Dutch lawyer should confirm anything you intend to rely on.

---

## Executive summary (plain language)

1. The science headline is directionally fair but worded too strongly: real studies show small benefits from self-affirmation, mostly for people under stress, and "daily" practice is not what those studies tested.
2. The "most strongly when people focus on their future selves" line is a stretch: it comes from one brain-imaging study (Cascio 2016) that found stronger brain activation for future-focused value thinking, not stronger real-world results.
3. That study's own authors call the behavioral version of the claim a hypothesis that still needs testing, so soften it to "especially when people imagine their future" or similar.
4. The benefits screen still says "Improve mental health", which the 17 Aug legal review already told you to soften; change it to "Support your mental well-being" before submission.
5. Those three benefit bullets are also copied word for word from I Am's benefits screen, so rewriting them fixes a legal problem and an IP problem at once.
6. On copying: the flow and quiz structure you borrowed are not protectable, but roughly 13 screens carry verbatim or near-verbatim I Am wording, plus a near-identical cream and serif look.
7. A lawsuit is unlikely: US law does not protect short phrases or functional flows, trade dress claims face high hurdles, Dutch law allows imitation unless it causes avoidable confusion about who made the product, and Monkey Taps shows no visible enforcement history.
8. The realistic risks are App Review Guideline 4.1 (copycats) and being publicly called a clone, and both are driven almost entirely by the verbatim strings, not by the flow.
9. Top fixes: rewrite the verbatim strings (the repetition interstitial, the benefits screen, the vision and belief questions, the streak caption "Build a streak, one day at a time"), rename the "Allow and Save" CTA, and retitle the paywall steps.
10. Also nudge the default cream palette away from I Am's, and fix the weekday tracker that is hardcoded to start on Saturday, a leftover from the reference recording that both looks copied and is a small bug.

---

# A. Science-claim verification

## A.0 What the app currently says (quoted, timestamped)

`src/features/onboarding/variants/iamClaude.ts`, step id `science`, as read at **10:57 +07**:

> headline: "Studies show daily self-affirmation boosts self-confidence, resilience and overall well-being."
> sub: "In brain-imaging studies it activates the brain's reward and self-processing centers — most strongly when people focus on their future selves."
> footnote: "Cohen & Sherman, Annual Review of Psychology (2014) · Cascio et al., Social Cognitive and Affective Neuroscience (2016)"

Re-read at **11:05 +07** (concurrent edit observed): identical except the sub's em dash became a comma ("...self-processing centers, most strongly when people focus on their future selves."). Substance unchanged.

Step id `benefits`, identical at both reads:

> headline: "The benefits of daily personalized affirmations"
> bullets: "Focus on achieving your goals" / "Shift negative thoughts" / "Improve mental health"
> cta: "Got it"

Note: the code comment above the science headline says "Claim wording stays inside what the cited papers support." As shown below, that is not quite true yet.

## A.1 What the cited papers actually show

### Cohen & Sherman 2014 (Annual Review of Psychology 65:333-371)

Read from the PDF hosted by Sherman's UCSB lab (accessed 2026-08-21). Abstract, verbatim:

> "People have a basic need to maintain the integrity of the self, a global sense of personal adequacy. Events that threaten self-integrity arouse stress and self-protective defenses that can hamper performance and growth. However, an intervention known as self-affirmation can curb these negative outcomes. Self-affirmation interventions typically have people write about core personal values. The interventions bring about a more expansive view of the self and its resources, weakening the implications of a threat for personal integrity. Timely affirmations have been shown to improve education, health, and relationship outcomes, with benefits that sometimes persist for months and years. Like other interventions and experiences, self-affirmations can have lasting benefits when they touch off a cycle of adaptive potential, a positive feedback loop between the self-system and the social system that propagates adaptive outcomes over time."

What the review supports: threat-buffering, stress reduction, better performance under pressure, narrowed achievement gaps for identity-threatened students, reduced defensiveness toward health messages. Key boundary conditions, verbatim from the "Moderators and Boundary Conditions" section (p. 358):

> "Social psychological interventions like affirmation are not panaceas but catalysts."
> "For affirmations to yield benefit, psychological threat must be a significant impediment to improvement. In the absence of threat, affirmation has different effects. It may increase self-confidence and resistance to change (Brinol et al. 2007)."
> "Affirmation will afford little benefit if the motivation and ability to improve are absent."

Two things matter for the app copy. First, the intervention studied is writing briefly about core personal values, usually once or a few times, not daily repetition of "I am" statements. Second, the review's only mention of self-confidence being increased is in a caveat about affirmation possibly backfiring (making people more resistant to change) when no threat is present. The review never claims affirmation "boosts self-confidence".

### Cascio et al. 2016 (Social Cognitive and Affective Neuroscience 11(4):621-629)

Read in full from PubMed Central PMC4814782 (accessed 2026-08-21). Design: 67 sedentary adults; affirmed participants reflected on their highest-ranked personal value, controls on their lowest; fMRI used a 2x2 design crossing (past vs future) with (value-relevant vs everyday scenarios). Findings, verbatim:

> "affirmed participants displayed significantly greater activity in the valuation network (M = 0.133) than control participants (M = -0.029) when viewing future-oriented value scenarios vs future-oriented everyday scenarios [t(57) = 3.26, P = 0.002]"
> "Neural activity within the valuation network (VS+VMPFC) was significantly greater when viewing future-oriented value scenarios (M = 0.108) compared with viewing past-oriented value scenarios (M = 0.003), t(29) = 3.83, P < 0.001" (within the affirmed group)

Behavioral link: increased VS+VMPFC and MPFC+PCC activity during value scenarios predicted decreased objectively measured sedentary behavior one month later (P = .030 and .039; n = 35 for these analyses). For future-oriented trials specifically the association was only **marginal** (P = .057). And on the exact point the app copy makes, the authors write, verbatim:

> "It is possible that future-oriented affirmations may be more successful than past-oriented affirmation, though between subjects follow up studies are needed to test this hypothesis."

So: the future-orientation result is (a) a neural activation contrast, future vs past thinking about **core values**, not "future selves"; (b) within one study of 67 people; (c) explicitly labeled a hypothesis at the behavioral level by its own authors. The parent intervention study (Falk et al. 2015, PNAS 112:1977-1982, same dataset; direct PNAS fetch was blocked by a 403, so its details here are as described within the Cascio paper) showed affirmation before health messages reduced sedentary behavior; it did not compare future vs past affirmation between groups.

### Corroborating literature (for calibration)

- Epton, Harris, Kane, van Koningsbruggen & Sheeran 2015 meta-analysis (Health Psychology 34(3):187-196; 144 experimental tests): self-affirmation had small but reliable positive effects on health message acceptance (d = .32), intentions (d = .14), and actual behavior (d = .32).
- Zhang, Chen, Hu & Wang 2025 meta-analysis (American Psychologist, doi 10.1037/amp0001591; 129 tests from 67 articles, nonclinical populations; abstract read from the APA PDF): "self-affirmation had small but significant positive effects on self-perception (ES = .32), general well-being (ES = 0.29), social well-being (ES = 0.26), and reduction of psychological barriers (ES = -.22)", with delayed effects sometimes larger than immediate ones. This is the best current support for a well-being claim, and it is explicitly "small but significant".
- Wood, Perunovic & Lee 2009 (Psychological Science 20:860-866): repeating a generic positive self-statement ("I'm a lovable person") made **low self-esteem** participants feel worse; benefits appeared only for high self-esteem participants and were limited. Directly relevant because the funnel targets people who select "I doubt myself". Note there is at least one published failure to replicate this backfire effect (JCBS 2019), so treat it as a caution, not a law.

## A.2 Where did the "future selves" sentence come from?

Two identifiable parents:

1. **The headline** is a lightly edited copy of I Am's science interstitial. The reference recording (docs/REFERENCE_IAM_SCREENS.md, screen 18) reads: "Studies show daily affirmations boost self-confidence, resilience, and overall well-being". The app version adds "self-" and drops a comma. I Am shows no citation; Future Self added the two citations afterwards.
2. **The sub's "future selves" clause** is a compression of the Cascio et al. 2016 **title**: "Self-affirmation activates brain systems associated with self-related processing and reward **and is reinforced by future orientation**". "Reinforced by future orientation" (a neural contrast between future- and past-oriented thinking about one's values) became "most strongly when people focus on their future selves", which conveniently matches the app's brand. The study never measured "future selves" (a distinct construct in other literatures, e.g. Hal Hershfield's future-self-continuity work) and never showed the *benefits* were strongest under future focus.

## A.3 Verdicts per phrase

| Phrase | Verdict | Basis |
|---|---|---|
| "Studies show" | Supported (weakly) | Two meta-analyses exist (Epton 2015; Zhang 2025); effects are small |
| "daily" | **Unsupported** | Studied interventions are brief written values exercises, not daily statement repetition; no dosage evidence for "daily"; Wood 2009 suggests rote repetition can backfire for low self-esteem users |
| "boosts self-confidence" | Partially supported (needs weaker wording) | Zhang 2025 "self-perception" ES = .32 (small); Cohen & Sherman never claim it, and their only self-confidence mention is a backfire caveat |
| "resilience" | Partially supported (needs weaker wording) | Strong threat/stress-buffering evidence (Cohen & Sherman; Epton), but trait resilience is not what was measured |
| "overall well-being" | Partially supported | Zhang 2025 general well-being ES = .29, small but significant, nonclinical samples |
| "In brain-imaging studies it activates the brain's reward and self-processing centers" | Supported | Cascio 2016: VMPFC+VS (valuation) and MPFC+PCC (self-processing); "studies" plural is a slight stretch for one core study plus the Falk parent study |
| "most strongly when people focus on their future selves" | Partially supported as a neural claim; **unsupported as a benefits claim** | Future-vs-past **activation** contrast in one n=67 study about future-oriented *values*, not "future selves"; behavioral link marginal (P = .057); authors call it a hypothesis |
| Benefits bullet "Focus on achieving your goals" | Partially supported | Behavior effect d = .32 (Epton); academic gains mostly for identity-threatened groups |
| Benefits bullet "Shift negative thoughts" | Partially supported | Reduced defensiveness and threat reactivity; "shift negative thoughts" is a fair soft paraphrase |
| Benefits bullet "Improve mental health" | **Unsupported as stated** | Clinical-sounding claim; evidence is small nonclinical well-being effects; LEGAL_REVIEW_2026-08-17.md §F.8 already directed softening to "Support your mental well-being"; as of 11:05 +07 the string is still "Improve mental health" (also a verbatim I Am copy, see B) |

## A.4 Replacement wordings (honest, still persuasive, no em dashes)

Science headline, pick one:

1. "Research links self-affirmation to greater well-being, less stress and more follow-through on goals."
2. "In dozens of studies, people who practice self-affirmation cope better with stress and stay more open to change."
3. "Self-affirmation is one of psychology's best-studied tools, with small but real benefits for well-being."

Science sub (the future-selves line), pick one:

1. "Brain-imaging research shows it engages the brain's reward and self-processing centers, especially when people imagine their future."
2. "In one brain-imaging study, those centers responded most when people thought about what matters to them in their future."
3. "Brain scans show these moments light up reward and self-reflection circuits, and imagining your future appears to amplify the effect."

Keep the citation footnote in all cases; it is a genuine differentiator (I Am cites nothing).

Benefits screen (fixes honesty and de-copies I Am at the same time), e.g.:

> headline: "What a daily practice can do"
> bullets: "Keep your goals in sight" / "Soften negative self-talk" / "Support your mental well-being"

Related string to update in the same pass: the `achieve` option "Improve my mental health" (user-selected goal, lower risk than an app claim, but "Care for my mental well-being" is safer and de-copies I Am screen 40).

## A.5 Side flags found while verifying

- Streak screen `info` line: "Most habit research puts the first real foothold around three weeks of daily reps." The best-known habit study (Lally et al. 2010, European Journal of Social Psychology 40:998-1009) found a **median 66 days** to peak automaticity (range 18-254); the three-week figure is folklore. Suggested honest rewrite: "Habit research says the early weeks are the hardest part. Keep the reps small and daily." 
- `belief-rewire` headline "Did you know affirmations can rewire your brain?" is framed as a question, which lowers claim risk, but it is the same neuro-claim ACM/FTC guidance would want supported if stated. Acceptable as a belief question; do not restate it as fact elsewhere.

## A.6 Sources for section A (all accessed 2026-08-21)

- Cascio et al. 2016, SCAN 11(4):621-629, full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC4814782/
- Cohen & Sherman 2014, Annu Rev Psychol 65:333-371, PDF: https://labs.psych.ucsb.edu/sherman/david/sites/labs.psych.ucsb.edu.sherman.david/files/pubs/cohen_sherman_2014.pdf (publisher page https://www.annualreviews.org/content/journals/10.1146/annurev-psych-010213-115137 returned 403)
- Falk et al. 2015, PNAS 112(7):1977-1982, doi 10.1073/pnas.1500247112 (direct fetch 403; design verified via the Cascio paper, same parent study)
- Epton et al. 2015, Health Psychology 34(3):187-196: https://pubmed.ncbi.nlm.nih.gov/25133846/ (located via https://research.manchester.ac.uk/en/publications/the-impact-of-self-affirmation-on-health-behavior-change-a-meta-a/)
- Zhang, Chen, Hu & Wang 2025, American Psychologist, doi 10.1037/amp0001591, PDF: https://www.apa.org/pubs/journals/releases/amp-amp0001591.pdf
- Wood, Perunovic & Lee 2009, Psychological Science 20:860-866: https://journals.sagepub.com/doi/abs/10.1111/j.1467-9280.2009.02370.x ; PDF mirror https://www.uni-muenster.de/imperia/md/content/psyifp/aeechterhoff/wintersemester2011-12/seminarthemenfelderdersozialpsychologie/04_wood_etal_selfstatements_psychscience2009.pdf ; replication caution: https://www.sciencedirect.com/science/article/abs/pii/S2212144719301103
- Lally et al. 2010, EJSP 40:998-1009: https://onlinelibrary.wiley.com/doi/abs/10.1002/ejsp.674

---

# B. Similarity / IP-risk audit vs "I Am" (and "Motivation")

## B.1 What was compared

`src/features/onboarding/variants/iamClaude.ts` (34 steps, read 10:57-11:05 +07) against docs/REFERENCE_IAM_SCREENS.md (frame-by-frame transcript of the I Am onboarding recording, 44 screens + 2 post-purchase), plus the shipped components that carry hardcoded copy or visual structure: `TimelinePaywall.tsx`, `StreakCommitStep.tsx`, `IamStep.tsx`, and `src/design-system/themes.ts` / `tokens.ts`. "Motivation" (also Monkey Taps) shares the publisher and legal docs but the funnel modeled here is I Am's, so the comparison is against I Am; everything below applies a fortiori to Motivation only insofar as it uses the same grammar.

Visual baseline: Future Self's default theme is cream `#EDE0D6` with dark-brown ink `#4B3A35`, near-black-brown CTA pill `#2A1E16`, serif headlines (Instrument Serif). I Am: cream `#EBDED8`, ink `#473535`, dark-brown CTA pill, Recoleta/Fraunces-style serif. Same option-row grammar (full-width rounded pills, right-side radio/check circles, auto-advance single-selects, no progress bar, interstitial breathers, top-right Skip).

## B.2 Screen-by-screen similarity table

Levels: **concept** (unprotectable idea/flow), **structure** (same screen mechanics, own copy), **close paraphrase** (recognizably reworded), **near-verbatim / verbatim** (wording risk).

| FS step | I Am screen | Level | Notes |
|---|---|---|---|
| welcome | 1 | concept | Original copy; deliberately drops "+20 million Lives changed" and testimonials. Low risk |
| name | 3 | structure | Sub reworded; placeholder "Your name" identical but generic |
| age | 4 | structure / close | Sub paraphrased; bands identical except "Under 18" vs "13 to 17" (functional lists) |
| motivation | none | original | |
| gap-interstitial | (interstitial pattern) | concept | Original aphorism |
| familiarity | 11 | **near-verbatim** | Headline identical incl. name insertion ("How familiar are you with affirmations, {name}?"); all 3 options verbatim |
| affirmations-intro | 10 | close paraphrase | "short phrases you repeat to yourself" -> "short, positive statements you repeat to yourself" + original tail; FS adds a condition so only newcomers see it |
| habit-helper | 12 | **near-verbatim** | Headline identical; 4 of 5 options verbatim or near (one swapped for a real FS feature) |
| repetition | 13 | **VERBATIM** | "Through daily repetition, you can change your beliefs and your mindset" is I Am's sentence word for word |
| notifications | 14 | structure + distinctive config | Mock notification card + count stepper + start/end time rows reproduced as a mechanism; headline/sub original; CTA "Allow and Save" **verbatim** |
| goals | (loosely 30/36) | concept | Original options |
| obstacles | 20 | concept | Original options |
| system-interstitial | (pattern) | concept | Original |
| results-preframe | 21 | close paraphrase | Same two ideas, clauses inverted ("You'll see results in a couple of weeks, practicing just a few minutes a day" -> "A few minutes a day is all it takes. Give it a couple of weeks.") |
| time-devotion | 22 | structure / near-verbatim options | Headline reworded; options "1/3/10 minutes a day" verbatim (functional) |
| streak-goal | 23 | **near-verbatim** | Headline "What goal do you want to start with?" identical; options "3/7/21 days in a row" verbatim |
| streak (commit) | 24 | structure + visual echo + one verbatim string | Big serif "1", weekday tracker card, first day checked; `StreakCommitStep.tsx` hardcodes caption "Build a streak, one day at a time" **verbatim** and the weekday array starts "Sa" because the reference recording was made on a Saturday (also a bug: the check always sits on "Sa"). Education lines are original |
| traits | none | original | |
| vision | 25 | **VERBATIM** | Headline and all 4 options word for word |
| belief-manifestation | 26 | **VERBATIM** | Headline and all 3 options word for word |
| belief-thoughts | 27 | **near-verbatim** | "your" added to headline; options verbatim |
| belief-rewire | 28 | **near-verbatim** | "Do you know" -> "Did you know ... can"; options near-verbatim (punctuation) |
| science | 18 | **near-verbatim headline** | "Studies show daily [self-]affirmation[s] boost[s] self-confidence, resilience and overall well-being"; FS adds an original sub + citations (I Am has none) |
| benefits | 29 | **VERBATIM** | Headline "The benefits of daily personalized affirmations" + all three bullets word for word; CTA "Got it" vs "Got it!" |
| quote-topics / affirmation-topics | 31 | structure | Chips grammar copied; all chip labels original; caption differs ("Try everything free" vs "Try it 3 days for free") |
| practice-mode | 32 | close paraphrase | Headline re-branded; 5 of 6 options are light rewrites, reordered; "Listening" dropped honestly (no audio) |
| app-icon | 33 | structure | Pre-paywall icon grid with trial caption is I Am's distinctive move; sub close paraphrase |
| theme | 34 | structure | Copy adapted |
| life-goal | 39 | structure | Free-text + counter + Save CTA mechanics; copy original and better |
| achieve | 40 | **near-verbatim** | "What do you want to achieve with {app}?" template; 4 of 6 options verbatim |
| result | none | original | |
| source | 2 | structure / close | Channel list is functional; moved to end of funnel (a real difference) |
| trial-preframe | 42-43 | close paraphrase | "No surprises, no pressure" -> "No surprises: we'll remind you..."; FS collapses two screens into one conditional one |
| paywall (TimelinePaywall) | 44 | structure + partial verbatim | Title "How your free trial works" and step "Install the app" verbatim; 4-node timeline, strikethrough first step, reminder toggle ("We'll remind you on {date}"), delayed close X. BUT this pattern is the industry-standard "Blinkist honest paywall" (see B.3); FS adds a plan selector, emoji icons, different step copy |
| widget-lock / widget-home | 45-46 | structure | Copy original |

Aggregate: **3 fully verbatim screens** (repetition, vision, belief-manifestation, plus the benefits screen making 4 counting its full bullet list), **~9 more near-verbatim or close-paraphrase screens**, 1:1 preservation of I Am's screen order across the middle of the funnel, and a near-identical visual system (cream/brown/serif/pill grammar). Also two verbatim micro-strings in components: "Allow and Save" (CTA) and "Build a streak, one day at a time" (hardcoded caption).

## B.3 Legal frames (verified 2026-08-21)

**US copyright.** 17 U.S.C. 102(b), verbatim: "In no case does copyright protection for an original work of authorship extend to any idea, procedure, process, system, method of operation, concept, principle, or discovery..." (law.cornell.edu). The Copyright Office's Circular 33 (rev. March 2021) confirms names, titles, "short phrases such as slogans" are not protectable, and neither are ideas, methods or systems (copyright.gov/circs/circ33.pdf). So: the quiz flow, auto-advance mechanics, question topics, notification stepper, streak screen concept and timeline paywall are unprotectable ideas/methods; individual headlines and option labels are unprotectable short phrases. Two caveats: (1) Feist Publications v. Rural Telephone, 499 U.S. 340 (1991) gives thin protection to original **selection and arrangement**; a plaintiff could argue the curated 40-screen sequence is a protectable compilation, and Future Self preserves much of I Am's selection *and* order. The defense is that the arrangement is largely functional/scenes a faire (every quiz funnel in the category asks name, age, goals, notifications, then paywall), which weakens but does not eliminate the argument. (2) The "look and feel" line of cases: Tetris Holding v. Xio Interactive, 863 F. Supp. 2d 394 (D.N.J. 2012) found wholesale copying of expressive audiovisual style infringing even where the underlying rules were free ("There is such similarity between the visual expression of Tetris and Mino that it is akin to literal copying"), and Spry Fox v. LOLApps (W.D. Wash. 2012) let a clone claim past dismissal. Those cases involved near-total clones of an expressive product; a same-genre onboarding with original copy would be far from them, but a version with 13 verbatim/near-verbatim screens is closer than it needs to be.

**US trade dress.** Lanham Act 43(a) (15 U.S.C. 1125(a)). Product-design trade dress is protectable "only upon a showing of secondary meaning" (Wal-Mart Stores v. Samara Bros., 529 U.S. 205 (2000), syllabus, law.cornell.edu), and functional features are never protectable (TrafFix, applied in Apple v. Samsung, 786 F.3d 983 (Fed. Cir. 2015), which **reversed** protection for the iPhone's asserted trade dress as functional; even Apple could not protect its GUI look against a rival). Monkey Taps would have to prove (a) the cream/serif onboarding look identifies *them* as a source in consumers' minds, (b) non-functionality, and (c) likelihood of confusion. All three are steep: the aesthetic is shared across the affirmation category, the quiz/paywall mechanics are functional, and confusion is unlikely where the app is found, bought and branded as "Future Self" with its own name and icon before any onboarding is seen. Tetris also granted trade dress relief, but for "arbitrary flourishes" in a near-clone; not comparable if the copy issues above are fixed.

**EU/NL: slaafse nabootsing.** Dutch law's baseline (settled since Hyster Karry Krane, refined in All Round v. Simstars (Mi Moneda), HR 19 May 2017, ECLI:NL:HR:2017:938, rechtspraak.nl): imitation of a product not covered by an IP right is **in principle permitted**, and becomes unlawful only if the original has an "eigen gezicht op de markt" (its own face on the relevant market, i.e. it stands out from similar offerings) and the imitator, being able to take reasonable steps to avoid confusion without hurting the soundness or usability of his product, fails to do so and thereby causes avoidable confusion about origin. Two observations: I Am's onboarding grammar is itself assembled from category-standard conventions, which weakens its "own face"; and origin confusion is improbable given distinct names, icons and store listings. But note the doctrine's logic cuts the other way on wording: verbatim sentences are the definition of "avoidable" imitation. A Dutch court would ask why "Through daily repetition, you can change your beliefs and your mindset" had to be identical. Since you are a Dutch eenmanszaak, NL is the venue where you are easiest to sue; keeping the flow but rewording everything avoidable is exactly what the doctrine rewards.

**App Store Guideline 4.1 (Copycats).** Current text (developer.apple.com, accessed 2026-08-21), 4.1(a): "Come up with your own ideas... Don't simply copy the latest popular app on the App Store, or make some minor changes to another app's name or UI and pass it off as your own. In addition to risking an intellectual property infringement claim, it makes the App Store harder to navigate and just isn't fair to your fellow developers." 4.1(b) covers impersonation; 4.1(c) covers using another developer's icon/brand/name. This is a **rejection/removal** risk decided by a reviewer, not a court; it does not require any protectable IP. Future Self is clearly not 4.1(b)/(c) (own name, own icon, own brand). The 4.1(a) exposure is "minor changes to another app's UI": a reviewer who knows I Am (one of the biggest apps in the category) and sees verbatim screens could flag it; a reviewer who sees a same-genre app with its own copy will not. The fix set below converts this from arguable to a non-issue. Also relevant: Apple can act on a complaint from Monkey Taps via the App Store dispute process at any time after approval, which is cheaper for them than any lawsuit; that is the most realistic enforcement channel and it is fully mitigated by the same rewording.

**The timeline paywall is genericized.** The "How your free trial works" timeline (trial start / reminder / charge, reminder toggle, "Try for $0.00") is the widely documented "Blinkist honest paywall": Blinkist introduced it, publicized the results (23% more trial starts, 74% notification opt-in), and it has been copied across the industry since ~2019 (growth.design case study; RevenueCat and Nami write-ups). I Am's paywall is itself an implementation of that pattern. This substantially weakens any claim that the paywall's structure is I Am's protectable expression, though the verbatim strings ("How your free trial works", "Install the app") are still worth varying since FS's version is otherwise already more differentiated (plan selector, own step copy).

## B.4 Monkey Taps enforcement history

Searched 2026-08-21 ("Monkey Taps" + lawsuit / trademark / cease and desist / enforcement; site-restricted USPTO mirror searches). Findings: **no evidence of Monkey Taps ever suing or publicly threatening a copycat**; no US trademark registration for "I AM" by Monkey Taps surfaced in the public mirrors checked (not conclusive; a proper TESS/TSDR search would confirm, and "I AM" would be a weak, crowded mark for affirmations in any case). The only litigation signal found is Monkey Taps as a **target**: a plaintiff firm (Ahdoot & Wolfson) is investigating a class action against Monkey Taps over app tracking/data sharing. The affirmation-app market is dense with lookalike funnels (Motivation is Monkey Taps' own second brand; ThinkUp, Gratitude, Me+ and others use the same grammar), and no copycat enforcement by anyone in the niche was found. This is a meaningful practical mitigant, not a legal one.

## B.5 Risk ratings

| Risk | Rating (today) | Rating after fix set B.6 | Reasoning |
|---|---|---|---|
| (a) Lawsuit (US or NL) | **Low, edging moderate only because of the verbatim aggregate** | Low | Short phrases and flows unprotectable; compilation and trade dress theories thin and expensive; slaafse nabootsing needs avoidable origin-confusion; no plaintiff history; damages would be speculative. The only exhibit a lawyer could wave is the stack of verbatim strings, and it is cheap to remove |
| (b) App Review 4.1 rejection | **Low-moderate** | Low | Not impersonation; own brand/icon/name; but 4.1(a) is reviewer discretion and the near-verbatim screens are the kind of thing a category-aware reviewer or a Monkey Taps complaint could trigger |
| (c) Brand perception ("it's an I Am clone") | **Moderate** | Low-moderate | The growth/UX teardown community documents the I Am funnel screen by screen; a side-by-side thread showing verbatim sentences is indefensible in public, while "same genre conventions, own voice" is a normal answer. This is the likeliest real-world harm |

Mitigating factors already present (worth keeping and, where useful, pointing to): entirely different name/brand/icon ("Future Self"); original interstitial voice and many original screens (welcome, motivation, goals, obstacles, traits, life-goal, result); honest claims where I Am fabricates (no "+20 million lives changed", no uncited "90% of people" stat; real citations added on the science screen); sensitive I Am questions deliberately dropped (zodiac, religion, gender, mood); "Try everything free" instead of "Try it 3 days for free"; paywall adds a plan selector and fuller disclosure; original quote library (docs/OWNER_QUOTE_LIST.md); source question moved to the end; skips added where I Am has none.

## B.6 The 3-5 changes that most reduce similarity

Ranked by risk reduction per hour of work. The single most-copied screens are the **benefits screen** and the **belief-question block**; the most distinctive borrowed visuals are the **streak commitment card** and the **notification config screen**.

1. **Rewrite every verbatim/near-verbatim string in `iamClaude.ts`** in one pass: `repetition` (whole sentence), `benefits` (headline + all three bullets; combine with the A.4 honesty fix), `vision`, `belief-manifestation`, `belief-thoughts`, `belief-rewire` (headlines and option labels; vary counts/order), `familiarity`, `habit-helper`, `streak-goal`, `achieve` (headline template + options), `science` headline (per A.4), `time-devotion` option labels ("One quiet minute" / "Three focused minutes" etc.). Options can keep meaning; change phrasing and order.
2. **StreakCommitStep.tsx**: replace the hardcoded caption "Build a streak, one day at a time" with your own line; make the weekday tracker start on the actual current weekday (fixes the copy-artifact bug where "Sa" is always first and always checked); consider replacing the 7-day week card with a goal-length dot grid (3/7/21 dots) so the visual no longer mirrors I Am's card at all.
3. **Notification screen**: keep the stepper and time window (functional, fine) but rename the CTA "Allow and Save" (e.g. "Set my reminders"), and restyle the mock notification card (different corner radius/fill, no stacked second card).
4. **TimelinePaywall.tsx**: retitle "Install the app" (e.g. "You showed up") and consider a variant of "How your free trial works" (e.g. "Your free trial, day by day"); the timeline structure itself is industry-standard and can stay.
5. **Default look**: nudge the first-run palette a step away from I Am's cream/brown (e.g. warm sand `#F1E5DC` already in the theme list, or a slightly cooler cream) and/or differentiate the option-row shape (softer radius instead of full pills, or left-aligned selection marks). Keep Instrument Serif; it already differs from I Am's Recoleta-style face.

Optional sixth: break the 1:1 sequence mapping by trimming one belief question (four in a row in identical order is the most fingerprint-like structural match) or swapping the position of two blocks.

## B.7 Sources for section B (all accessed 2026-08-21)

- 17 U.S.C. 102(b): https://www.law.cornell.edu/uscode/text/17/102
- US Copyright Office, Circular 33 "Works Not Protected by Copyright" (rev. 2021-03): https://www.copyright.gov/circs/circ33.pdf
- Feist v. Rural, 499 U.S. 340 (1991) (selection/arrangement; standard citation, discussed in Circular 33's framework)
- Tetris Holding v. Xio Interactive (D.N.J. 2012): https://www.loeb.com/en/insights/publications/2012/06/tetris-holding-llc-v-xio-interactive-inc ; https://en.wikipedia.org/wiki/Tetris_Holding,_LLC_v._Xio_Interactive,_Inc.
- Spry Fox v. LOLApps (W.D. Wash. 2012): https://en.wikipedia.org/wiki/Spry_Fox,_LLC_v._Lolapps,_Inc.
- Wal-Mart v. Samara Bros., 529 U.S. 205 (2000), syllabus: https://www.law.cornell.edu/supct/html/99-150.ZS.html
- Apple v. Samsung, 786 F.3d 983 (Fed. Cir. 2015) (trade dress reversed as functional): https://caselaw.findlaw.com/court/us-federal-circuit/1701304.html ; https://www.lexology.com/library/detail.aspx?g=d3db74aa-f13b-4b35-88f1-95d2b456ae60
- Trade dress definition / 43(a): https://www.law.cornell.edu/wex/trade_dress
- Slaafse nabootsing, HR 19 May 2017 (All Round/Simstars), ECLI:NL:HR:2017:938: https://uitspraken.rechtspraak.nl/details?id=ECLI%3ANL%3AHR%3A2017%3A938 ; analysis: https://www.barentskrans.nl/publicatie-blogs/verwarringsgevaar-slaafse-nabootsing/ ; https://cassatieblog.nl/intellectuele-eigendomsrecht/slaafse-nabootsing-het-eigen-gezicht-van-een-ontwerp-kan-verwateren/
- App Review Guidelines 4.1: https://developer.apple.com/app-store/review/guidelines/
- Monkey Taps enforcement search (no plaintiff-side history found; defendant-side class-action investigation): https://www.ahdootwolfson.com/blog/monkey-taps-apps-class-action-investigation/
- Blinkist "honest paywall" provenance: https://growth.design/case-studies/trial-paywall-challenge ; https://www.nami.ml/blog/2023-paywall-trends ; https://www.revenuecat.com/blog/engineering/how-to-build-a-blinkist-style-paywall-using-revenuecat-webhooks-and-zapier/
- Repo artifacts compared: `src/features/onboarding/variants/iamClaude.ts`, `src/features/onboarding/engine/steps/StreakCommitStep.tsx`, `src/features/onboarding/engine/steps/IamStep.tsx`, `src/features/paywall/TimelinePaywall.tsx`, `src/design-system/themes.ts`, `docs/REFERENCE_IAM_SCREENS.md`, `docs/REFERENCE_ANALYSIS.md`, `docs/LEGAL_REVIEW_2026-08-17.md`
