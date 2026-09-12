# Reference: I Am — Daily Affirmations, onboarding screen-by-screen

Source: `copy_262C0BDD-4CCE-4DE9-83F7-9DBBAEFE02B6.MOV` (592×1280, 30 fps, 9:33).
Frames were extracted at 1 fps for 0:00–3:45 (`sec_NNN.png`, NNN = seconds), at
5 fps for transition timing, and at 10 fps around selections; scene-change
frames were extracted for the whole file. Key frames were saved as
`key_NN_<slug>.png` in the frames directory
(`…/scratchpad/iam-frames/`). All copy below was read from full-resolution or
2× zoomed frames; nothing is paraphrased. Recording date shown by the paywall:
Aug 8 (trial reminder "Aug 10", trial ends "Aug 11"). Status-bar time 5:23 PM
at start.

The onboarding funnel runs 0:03–3:17 (Welcome → paywall), 44 screens, followed
by two widget-setup screens after purchase and then the main app.

Notation: **single** = single-select pill rows, auto-advance on tap (no
Continue) · **multi** = pill rows with check circles + Continue · **chips** =
tag chips + Continue · **text** = free text · **info** = interstitial with one
CTA · **config** = custom controls.

---

## 1. Ordered table of all onboarding screens

| #   | Time (mm:ss)     | Headline (exact)                                                                                                       | Sub-headline (exact)                                                         | Options in order (exact)                                                                                                                                                                                                                                                                                   | Type                    | CTA / Skip                                                                                                                                                          |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0:03.3–0:11.6    | (no headline; app-icon mark "I AM", then "+20 million" / "Lives changed" between laurel branches)                      | "Transform your mindset with powerful affirmations"                          | Rotating 5-star quotes: "Life-changing" → "I love getting small reminders to think positive throughout the day" → "This app has helped me get through so many tough times"                                                                                                                                 | info                    | "Get started"; footer "By continuing you agree to our Terms and Privacy Policy"; no Skip                                                                            |
| 2   | 0:11.7–0:19.6    | How did you hear about I am?                                                                                           | Select an option to continue                                                 | Web search · App Store · Friend/family · TikTok · Instagram · Facebook · Other                                                                                                                                                                                                                             | single                  | none (auto-advance); **no Skip**. iOS ATT alert overlays this screen 0:12–0:17                                                                                      |
| 3   | 0:19.7–0:26.4    | What do you want to be called?                                                                                         | Your name will appear in your affirmations                                   | Text field, placeholder "Your name"; keyboard opens automatically                                                                                                                                                                                                                                          | text                    | "Continue" (sits just above keyboard); Skip                                                                                                                         |
| 4   | 0:26.5–0:29.8    | How old are you?                                                                                                       | Your age is used to personalize your content                                 | 13 to 17 · 18 to 24 · 25 to 34 · 35 to 44 · 45 to 54 · 55+                                                                                                                                                                                                                                                 | single                  | Skip                                                                                                                                                                |
| 5   | 0:30.0–0:33.0    | Which option represents you best, Jasmin?                                                                              | Some affirmations will use your gender or pronouns                           | Female · Male · Others · Prefer not to say                                                                                                                                                                                                                                                                 | single                  | Skip                                                                                                                                                                |
| 6   | 0:33.1–0:35.0    | Get affirmations that fit your relationship status                                                                     | Choose the option that describes it the best                                 | In a happy relationship · Happily single · Single and open to connection · It's complicated · Going through a breakup · Not interested in this topic                                                                                                                                                       | single                  | Skip                                                                                                                                                                |
| 7   | 0:35.1–0:37.2    | What's your employment status?                                                                                         | Choose the option that describes it the best                                 | Studying · Looking for a job · Working · Retired · Stay at home parent · Other                                                                                                                                                                                                                             | single                  | Skip                                                                                                                                                                |
| 8   | 0:37.3–0:39.2    | Are you religious?                                                                                                     | This information will be used to tailor your affirmations to your beliefs    | Yes · No · Spiritual but not religious                                                                                                                                                                                                                                                                     | single                  | Skip                                                                                                                                                                |
| 9   | 0:39.3–0:41.0    | What's your Zodiac sign?                                                                                               | This information will be used to personalize your affirmations               | Capricorn · Aquarius · Pisces · Aries · Taurus · Gemini · Cancer · Leo · Virgo · Libra · (list scrolls; Scorpio/Sagittarius below the fold, not shown) — each with a thin-line zodiac glyph at left                                                                                                        | single (scrolling list) | Skip (user skipped)                                                                                                                                                 |
| 10  | 0:41.0–0:44.0    | Affirmations are short phrases you repeat to yourself                                                                  | —                                                                            | —                                                                                                                                                                                                                                                                                                          | info                    | "Continue"; no Skip                                                                                                                                                 |
| 11  | 0:44.0–0:45.4    | How familiar are you with affirmations, Jasmin?                                                                        | Your experience will be adjusted according to your answer                    | This is new for me · I've used them occasionally · I use them regularly                                                                                                                                                                                                                                    | single                  | Skip                                                                                                                                                                |
| 12  | 0:45.5–0:50.8    | What would help make affirmations a daily habit?                                                                       | You can select more than one option                                          | Getting regular reminders · Tracking my progress · A home/lock screen widget · A guided practice · I don't know yet                                                                                                                                                                                        | multi                   | "Continue"; Skip                                                                                                                                                    |
| 13  | 0:50.9–0:54.2    | Through daily repetition, you can change your beliefs and your mindset                                                 | —                                                                            | —                                                                                                                                                                                                                                                                                                          | info                    | "Continue"; no Skip                                                                                                                                                 |
| 14  | 0:54.3–1:21.6    | Get positivity throughout the day                                                                                      | Reading affirmations regularly will help you reach your goals                | Mock notification card; "How many" −/+ stepper (default 10x); "Start at" 9:00 AM; "End at" 10:00 PM (see §2f)                                                                                                                                                                                              | config                  | "Allow and Save" → iOS notification permission alert; no Skip                                                                                                       |
| 15  | 1:22.0–1:23.8    | Let's see what affirmations you need right now...                                                                      | —                                                                            | —                                                                                                                                                                                                                                                                                                          | info                    | "Continue"; no Skip                                                                                                                                                 |
| 16  | 1:23.9–1:25.4    | How have you been feeling lately, Jasmin?                                                                              | Choose a mood to personalize your content                                    | Awesome (deep smile arc) · Good (shallow smile arc) · Neutral (flat line) · Bad (shallow frown arc) · Terrible (deep frown arc) · Other (wavy line) — thin-line "mouth" glyphs at left                                                                                                                     | single                  | **no Skip**                                                                                                                                                         |
| 17  | 1:25.5–1:31.0    | What's making you feel that way?                                                                                       | You can select more than one option                                          | Love (two overlapping hearts) · Family (house with heart) · Work (briefcase) · Health (heart with pulse line) · Friends (two hands) · Other (three dots)                                                                                                                                                   | multi                   | "Continue"; **no Skip**                                                                                                                                             |
| 18  | 1:31.1–1:33.4    | Studies show daily affirmations boost self-confidence, resilience, and overall well-being                              | —                                                                            | —                                                                                                                                                                                                                                                                                                          | info                    | "Continue"; no Skip                                                                                                                                                 |
| 19  | 1:33.5–1:36.2    | How do you improve your mental health?                                                                                 | You can select more than one option                                          | Meditation · Therapy · Spending time in nature · Journaling · Support from others · Exercise and nutrition                                                                                                                                                                                                 | multi                   | "Continue"; Skip                                                                                                                                                    |
| 20  | 1:36.3–1:39.4    | What gets in the way of making self-care a habit?                                                                      | You can select more than one option                                          | Nothing, I do it every day · I haven't found what works · I don't know where to start · I lose momentum or forget · I get overwhelmed and give up · I don't see an immediate effect                                                                                                                        | multi                   | "Continue"; Skip                                                                                                                                                    |
| 21  | 1:39.4–1:42.6    | You'll see results in a couple of weeks, practicing just a few minutes a day                                           | —                                                                            | —                                                                                                                                                                                                                                                                                                          | info                    | "Continue"; no Skip                                                                                                                                                 |
| 22  | 1:42.7–1:44.5    | How much time will you devote to affirmations?                                                                         | You can change your goal later                                               | 1 minute a day · 3 minutes a day · 10 minutes a day                                                                                                                                                                                                                                                        | single                  | Skip                                                                                                                                                                |
| 23  | 1:44.6–1:46.5    | What goal do you want to start with?                                                                                   | You can change your goal later                                               | 3 days in a row · 7 days in a row · 21 days in a row                                                                                                                                                                                                                                                       | single                  | Skip                                                                                                                                                                |
| 24  | 1:46.6–1:59.2    | Build a daily affirmation habit that sticks                                                                            | (card caption) Build a streak, one day at a time                             | Animated line-art plant + big serif "1"; weekday tracker card Sa Su Mo Tu We Th Fr (Sa filled pink with check)                                                                                                                                                                                             | info                    | "Continue"; no Skip                                                                                                                                                 |
| 25  | 1:59.3–2:01.0    | Do you have a clear vision of the life you want?                                                                       | Choose one to continue                                                       | Yes, I do · I'm working on it · I take it one day at a time · Not really                                                                                                                                                                                                                                   | single                  | Skip                                                                                                                                                                |
| 26  | 2:01.1–2:02.8    | Do you believe in the power of manifestation?                                                                          | Choose one to continue                                                       | Yes, absolutely · Not sure, but I'm curious · It's not my thing                                                                                                                                                                                                                                            | single                  | Skip                                                                                                                                                                |
| 27  | 2:02.9–2:04.6    | Do you believe thoughts help shape your reality?                                                                       | Choose one to continue                                                       | Yes, I've seen it happen · I'm open to it · Not really                                                                                                                                                                                                                                                     | single                  | Skip                                                                                                                                                                |
| 28  | 2:04.7–2:06.2    | Do you know affirmations rewire your brain?                                                                            | Choose one to continue                                                       | Yes, I believe that · I've heard of it, but I'm not sure · I didn't know, tell me more · I'm skeptical, but open                                                                                                                                                                                           | single                  | Skip                                                                                                                                                                |
| 29  | 2:06.3–2:16.6    | The benefits of daily personalized affirmations                                                                        | —                                                                            | Bullets: Focus on achieving your goals (target icon) · Shift negative thoughts (person, "−" in head) · Improve mental health (person, "+" in head); line-art open book with planet/moon/stars above                                                                                                        | info                    | "Got it!"; no Skip                                                                                                                                                  |
| 30  | 2:16.6–2:20.2    | What would you like to change with affirmations?                                                                       | Choose at least one to tailor your content so it resonates with you          | How I speak to myself · How I handle stress/setbacks · How I show up for others · How I stay focused on goals · How I think about life · I don't know yet                                                                                                                                                  | multi                   | "Continue"; Skip                                                                                                                                                    |
| 31  | 2:20.3–2:27.0    | Which topics are you interested in?                                                                                    | This will be used to personalize your feed                                   | Chips, two per row, in this order: + Gratitude · + Self-talk / + Dream big · + Confidence / + Overthinking · + Self-love / + Morning · + Attraction / + Feeling sassy · + Romance / + Inner child · + Purpose / + Positivity · + Anxiety                                                                   | chips                   | caption "Try it 3 days for free" + "Continue"; Skip                                                                                                                 |
| 32  | 2:27.1–2:31.6    | How would you like to practice affirmations?                                                                           | Choose at least one                                                          | Writing in a journal · Writing on a post-it · Saying them aloud · Listening to them · Reading them on my phone · I'm not sure                                                                                                                                                                              | multi                   | "Continue" (no caption); Skip                                                                                                                                       |
| 33  | 2:31.7–2:36.2    | Which icon style do you like the most?                                                                                 | This will be the app's icon on your phone's Home Screen                      | 3×3 grid of app icons (first = peach gradient "I am", pre-selected with check badge)                                                                                                                                                                                                                       | single grid + Continue  | caption "Try it 3 days for free" + "Continue"; **no Skip**                                                                                                          |
| 34  | 2:36.3–2:43.6    | Which theme would you like to start with?                                                                              | Choose from a larger selection of themes or create your own later            | 3×2 grid of theme tiles (first = cream "I am", pre-selected with check badge)                                                                                                                                                                                                                              | single grid + Continue  | caption "Try it 3 days for free" + "Continue"; **no Skip**                                                                                                          |
| 35  | 2:43.7–2:48.6    | Discover the Self-Growth Essentials bundle                                                                             | Invest in yourself with a huge discount by subscribing to our 6 apps at once | Line-art illustration of stacked app tiles (V, ", lotus, I am) with leaves; text link with download icon "Get bundle"                                                                                                                                                                                      | info / cross-promo      | "Continue"; Skip                                                                                                                                                    |
| 36  | 2:48.7–2:53.6    | What do you want to improve?                                                                                           | Choose at least one to tailor your content so it resonates with you          | Positive thinking (head with smile) · Love (two hearts) · Happiness (smiley with rays) · Loving my body (torso) · Being thankful (praying hands) · Personal growth (sprout) · Stress & anxiety (head with lightning) · Loving myself (hand holding sprout with heart) — 8 rows, list scrolls under the CTA | multi                   | "Continue"; **no Skip**                                                                                                                                             |
| 37  | 2:53.7–2:56.4    | What are you struggling to let go of?                                                                                  | Choose at least one to tailor your content so it resonates with you          | Memories · Misplaced hopes · Blame, anger, and resentment · Failed plans · Broken relationships · Other                                                                                                                                                                                                    | multi                   | "Continue"; Skip                                                                                                                                                    |
| 38  | 2:56.5–2:59.4    | Been avoiding anything you really should confront?                                                                     | Choose at least one to tailor your content so it resonates with you          | Healing from my past · Setting goals for my future · Transforming my relationships · Advancing my work and career · Improving my financial situation · Other                                                                                                                                               | multi                   | "Continue"; Skip                                                                                                                                                    |
| 39  | 2:59.5–3:07.2    | What are your goals right now?                                                                                         | The more you share, the more personalized your affirmations will be          | Multi-line text area, placeholder "I want to...", counter "0/250" bottom-right of the box                                                                                                                                                                                                                  | text                    | "Save goals" (greyed until text is entered, then dark); Skip                                                                                                        |
| 40  | 3:07.3–3:09.4    | What do you want to achieve with I am?                                                                                 | Choose at least one to see affirmations based on your goals                  | Learn to love myself · Personal growth · Be more present and enjoy life · Feel more self-confident · Develop a positive mindset · Improve my mental health                                                                                                                                                 | multi                   | "Continue"; Skip                                                                                                                                                    |
| 41  | 3:09.5–3:11.9    | According to studies, 90% of people who practice affirmations report reduced stress and increased emotional resilience | —                                                                            | —                                                                                                                                                                                                                                                                                                          | info                    | "Continue"; no Skip                                                                                                                                                 |
| 42  | 3:12.0–3:14.4    | We offer 3 days of Premium access for free, just for you                                                               | —                                                                            | —                                                                                                                                                                                                                                                                                                          | info                    | "Try it for free"; no Skip                                                                                                                                          |
| 43  | 3:14.5–3:16.6    | We'll send you a reminder 1 day before your trial ends                                                                 | No surprises, no pressure                                                    | Line-art hand holding a phone (screen "11:11") with a bell and sparkles                                                                                                                                                                                                                                    | info                    | "Try it for free"; no Skip                                                                                                                                          |
| 44  | 3:16.7–3:37      | How your free trial works                                                                                              | —                                                                            | Timeline: Install the app / Today - Free trial starts / Aug 10 - Trial reminder / Aug 11 - Become member; toggle "Reminder before trial ends"                                                                                                                                                              | paywall                 | "Try for $0.00"; fine print "$4.99/month, billed yearly as $59.99/year"; Restore · Terms & Conditions · Privacy Policy; close X appears top-left ≈3.2 s after entry |
| 45  | 3:38–4:01 (post) | Get affirmations without unlocking your phone                                                                          | Set up widgets to see them on your phone's Lock Screen                       | Mock lock screen: "Mon 1 Your affirmation", "9:41", two widgets "Your affirmation will go here"                                                                                                                                                                                                            | info                    | "Got it!"                                                                                                                                                           |
| 46  | 4:03–4:09 (post) | Add a widget to your Home Screen                                                                                       | On your phone's Home Screen, touch and hold an empty area, then tap Edit     | Mock home screen with widget "I am enough."                                                                                                                                                                                                                                                                | info                    | "Install widget" (primary) + "Remind me later" (text button)                                                                                                        |

Screens 45–46 appear after the App Store purchase sheet ("I am Premium (1 year)"
· "I am - Daily Affirmations" · "Family Subscription" · "3-day free trial /
Starting today" · "$59.99 per year / Starting Aug 11, 2026" · "No commitment.
Cancel anytime in Settings") and the "You're all set. Your purchase was
successful." alert. After 46 the app hands
off to the iOS widget gallery, then shows "Welcome to I am" / "Swipe up" (6:51)
and the feed.

---

## 2. Key screens in detail

### a. Welcome (0:03.3–0:11.6) — `key_01_welcome.png`, `key_01_welcome_quote2.png`, `key_01_welcome_quote3.png`

- Cream background. Vertically: a rounded-square app mark drawn as a thin double
  outline (two offset strokes), tilted ~12° clockwise, containing outlined
  uppercase "I AM" (thin line art) at ~y 21–32 %; then
  "+20 million" (serif, bold, ~26 pt) with a laurel branch left and right and
  "Lives changed" (sans, ~18 pt) beneath; then "Transform your mindset with
  powerful affirmations" (sans, ~18 pt, two centered lines); then five dark
  stars and a rotating testimonial in quotes ("Life-changing" → "I love getting
  small reminders to think positive throughout the day" → "This app has helped me
  get through so many tough times"), swapping every ~4 s with a cross-fade.
- CTA: full-width dark-brown pill "Get started" (white bold sans).
- Footer directly under the CTA, single line, small grey sans:
  "By continuing you agree to our **Terms** and **Privacy Policy**" — the two
  link words are **bold and underlined** (look tappable); the rest is regular
  weight. No Skip, no sign-in link, no page dots.

### b. Familiarity (0:44.0–0:45.4) — `key_11_familiar.png`

- Headline (serif, 2 lines): "How familiar are you with affirmations, Jasmin?"
- Sub (sans, 2 lines): "Your experience will be adjusted according to your answer"
- Options (single, auto-advance): 1 "This is new for me" · 2 "I've used them
  occasionally" · 3 "I use them regularly". Skip top-right. User picked #1 and
  the app advanced within ~0.5 s.

### c. Habit drivers (0:45.5–0:50.8) — `key_12_habit_help.png`, `key_12_habit_help_selected.png`

- Headline: "What would help make affirmations a daily habit?"
- Sub: "You can select more than one option"
- Options (multi): 1 "Getting regular reminders" · 2 "Tracking my progress" ·
  3 "A home/lock screen widget" · 4 "A guided practice" · 5 "I don't know yet".
- Selected state: circle becomes a solid dark-brown disc with a white check; the
  row background turns near-white; the row does not scale (contrast with
  single-select). CTA "Continue" pinned bottom; Skip top-right.

### d. Education interstitials

- **10** (0:41–0:44) — `key_10_edu_short_phrases.png`: "Affirmations are short
  phrases you repeat to yourself". Serif, ~26 pt, centered on the vertical
  middle of an otherwise empty cream screen; single "Continue" pill at the
  bottom; no Skip; no illustration.
- **13** (0:50.9–0:54.2) — `key_13_edu_repetition.png`: "Through daily repetition,
  you can change your beliefs and your mindset" — same layout (3 centered lines),
  "Continue".
- **15** (1:22–1:23.8) — `key_15_lets_see.png`: "Let's see what affirmations you
  need right now..." (three trailing dots), same layout, "Continue".
- **21** (1:39.4–1:42.6) — `key_21_results_weeks.png`: "You'll see results in a
  couple of weeks, practicing just a few minutes a day", same layout, "Continue".
- **41** (3:09.5–3:11.9) — `key_41_stat_90pct.png`: "According to studies, 90% of
  people who practice affirmations report reduced stress and increased emotional
  resilience", same layout (5 lines), "Continue". No source/citation.
- The CTA on these screens shrinks slightly on press (visible at 1:42.6).

### e. Science/proof screen (1:31.1–1:33.4) — `key_18_science_studies.png`

- Text only, serif, centered mid-screen, four lines: "Studies show daily
  affirmations boost self-confidence, resilience, and overall well-being".
- No citation, source line, illustration, or icon. CTA "Continue". No Skip.
- Placement in flow: directly after "What's making you feel that way?" and
  before "How do you improve your mental health?".

### f. Notifications configuration (0:54.3–1:21.6) — `key_14_notifications.png` (clean, 0:56), `key_14_notifications_initial_54s.png`, `key_14_notifications_headsup_alert.png`, `key_14_notifications_picker_start.png`, `key_14_notifications_picker_end.png`, `key_14_notifications_20x_custom_times.png`, `key_14_notifications_system_prompt.png`

Top-to-bottom order and spacing (592-px-wide frame; ≈1.5 px per pt):

1. No Skip, no back. Headline (serif, 2 lines, centered) at y≈175–240 px:
   "Get positivity throughout the day".
2. Sub (sans, 2 lines, centered) at y≈285–325: "Reading affirmations regularly
   will help you reach your goals".
3. Mock notification (front card y≈395–500, ≈70 pt tall): a rounded card
   (radius ≈ 20 px) with a light pink/peach fill and thin white border, full
   width minus 15-pt margins.
   Contents: small rounded-square app icon (peach, tiny serif "I am") at left;
   title "I am" (bold sans) with "Now" (grey) at far right; body "I am worthy of
   the chance to reach my full potential." A second, slightly narrower card peeks
   ~10 px below it (a stacked pair, like an iOS notification group). The card
   drops in from above (banner style, ~0.3 s) when the screen appears; the body
   text does not change during the 25 s the screen is shown.
4. Gap ≈ 50 px, then a **"How many" pill row** (y≈580–656, ≈51 pt tall,
   same 15-pt side margins as option rows): near-white fully rounded row, label
   "How many" at left (≈20 pt inset); at right a stepper made of two solid
   dark-brown **circular** buttons (≈54 px / 36 pt diameter; the "+" sits
   ≈15 pt from the row's right edge, the "−" ≈ 55 % across the row) with a thin
   white "−" and "+", and the count text "10x" (sans, ~15 pt) centred between
   them.
   Default **10x**. Tapping "−"/"+" changes by 1 (observed 10→6→9→10→14→15…→20).
   Pressed button briefly turns light grey. When the count reached **15x** an
   iOS alert appeared: title "Heads up!", message "We can only schedule 60
   reminders at a time. If you stop getting them, please launch the app and
   they'll be reset.", button "Done". The user then continued to **20x** (no
   further alert; whether 20 is the maximum was not observed).
5. Immediately below (≈17 px gap) a **grouped card** (rounded corners ≈ 16 px,
   near-white, y≈674–812 → ≈92 pt for two ≈46-pt rows separated by a hairline):
   "Start at" with a grey rounded-rectangle value chip **"9:00 AM"** at right,
   and "End at" with **"10:00 PM"**. The value chips are the native iOS compact
   date-picker style (light-grey rounded rectangle, ~15 pt text, ≈15 pt from
   the card's right edge).
6. Tapping a chip opens the **native inline wheel-picker popover** (frosted white
   rounded card floating above the row, overlapping the "How many" row and the
   notification card; three wheels hour · minute · AM/PM). It is dismissed by
   tapping outside; the chip updates to the new value. Observed: Start → 9:31 PM
   (1:08–1:12), End → 5:17 PM (1:12–1:15) — the app accepted End < Start without
   an error.
7. Large empty area, then CTA pill **"Allow and Save"** at the bottom (same dark
   pill as elsewhere). Tapping it triggers the iOS alert "“I am” Would Like to
   Send You Notifications — Notifications may include alerts, sounds, and icon
   badges. These can be configured in Settings." (Don't Allow / Allow). After
   Allow the flow proceeds to interstitial 15.

### g. Time commitment (1:42.7–1:44.5) — `key_22_time_commitment.png`, `key_22_time_commitment_selected.png`

- Headline: "How much time will you devote to affirmations?"
- Sub: "You can change your goal later"
- Options (single, auto-advance): 1 "1 minute a day" · 2 "3 minutes a day" ·
  3 "10 minutes a day". Skip top-right. User picked "3 minutes a day".
- Selection animation (10 fps frames 1:44.1–1:44.7): the tapped row turns
  near-white and scales up ~3 %, its radio fills with a dark dot inside a ring;
  the other rows fade to ~50 % and shrink slightly; after ≈0.4 s the screen
  slides left with a cross-fade (~0.3 s) into the next question.

### h. Streak goal (1:44.6–1:46.5) — `key_23_streak_goal.png`, `key_23_streak_goal_selected.png`; streak commitment (1:46.6–1:59.2) — `key_24_streak_commit_start.png`, `key_24_streak_commit.png`

- Headline: "What goal do you want to start with?" · Sub: "You can change your
  goal later" · Options (single): 1 "3 days in a row" · 2 "7 days in a row" ·
  3 "21 days in a row". Skip. User picked "7 days in a row" → auto-advance.
- Commitment screen: no Skip. Upper half: line-art plant growing out of a wavy
  ground line (a single stem at 1:46.6 → three long leaves by ~1:52), a large
  serif numeral **"1"** to its right, small four-point sparkles that twinkle
  around it. Below: headline "Build a daily affirmation habit that sticks"
  (serif, 2 lines, centred). Below that a near-white rounded card containing a
  weekday tracker: labels **Sa Su Mo Tu We Th Fr** (starts on the recording day,
  Saturday) over seven circles; the first circle is filled soft pink with a white
  check, the other six are empty light-grey discs; caption inside the card:
  "Build a streak, one day at a time". CTA "Continue". The user lingered ~12 s.

### i. Belief questions (1:59.3–2:06.2) — `key_25_vision.png`, `key_26_belief_manifestation.png`, `key_27_belief_thoughts.png`, `key_28_belief_rewire.png`

Four consecutive single-select screens with **no interstitials between them**;
each has sub "Choose one to continue" and Skip; each auto-advances:

1. "Do you have a clear vision of the life you want?" — Yes, I do · I'm working
   on it · I take it one day at a time · Not really
2. "Do you believe in the power of manifestation?" — Yes, absolutely · Not
   sure, but I'm curious · It's not my thing
3. "Do you believe thoughts help shape your reality?" — Yes, I've seen it
   happen · I'm open to it · Not really
4. "Do you know affirmations rewire your brain?" — Yes, I believe that · I've
   heard of it, but I'm not sure · I didn't know, tell me more · I'm skeptical,
   but open

The streak commitment screen precedes #1; the benefits screen (j) follows #4.

### j. Benefits (2:06.3–2:16.6) — `key_29_benefits.png`

- Illustration (line art, dark brown on cream, upper third): an open book seen
  from the front with a ringed planet, a crescent moon with a ring, a burst star
  and small four-point sparkles floating above it; sparkles twinkle.
- Headline (serif, 2 lines, centred): "The benefits of daily personalized
  affirmations".
- Three left-aligned bullet rows (thin-line icon in a fixed-width column, sans
  text ~17 pt):
  1. target/concentric-circles icon — "Focus on achieving your goals"
  2. person bust with a "−" in the head — "Shift negative thoughts"
  3. person bust with a "+" in the head — "Improve mental health"
- CTA "Got it!" (dark pill). No Skip.

### k. Practice modes (2:27.1–2:31.6) — `key_32_practice_how.png`

- Headline: "How would you like to practice affirmations?" · Sub: "Choose at
  least one".
- Options (multi): 1 "Writing in a journal" · 2 "Writing on a post-it" ·
  3 "Saying them aloud" · 4 "Listening to them" · 5 "Reading them on my phone" ·
  6 "I'm not sure". CTA "Continue"; Skip. No trial caption on this screen.

### l. Last questions before the paywall — `key_36_improve.png`, `key_37_let_go.png`, `key_38_confront.png`, `key_39_goals_text.png`, `key_39_goals_text_filled.png`, `key_40_achieve.png`

Order after the bundle cross-promo: 36 improve → 37 let go → 38 confront →
39 free-text goals → 40 achieve → interstitial 41 → trial pre-frames → paywall.

- **36 "What do you want to improve?"** / "Choose at least one to tailor your
  content so it resonates with you" — Positive thinking · Love · Happiness ·
  Loving my body · Being thankful · Personal growth · Stress & anxiety · Loving
  myself (multi, icons, no Skip, list scrolls behind the CTA).
- **37 "What are you struggling to let go of?"** / same sub — Memories ·
  Misplaced hopes · Blame, anger, and resentment · Failed plans · Broken
  relationships · Other (multi, Skip).
- **38 "Been avoiding anything you really should confront?"** / same sub —
  Healing from my past · Setting goals for my future · Transforming my
  relationships · Advancing my work and career · Improving my financial
  situation · Other (multi, Skip).
- **39 "What are your goals right now?"** / "The more you share, the more
  personalized your affirmations will be" — near-white rounded text area
  (~4 lines tall) with placeholder "I want to..." and counter "0/250"
  bottom-right; keyboard open; button "Save goals" greyed until text exists
  (user typed a sentence, button turned dark); Skip.
- **40 "What do you want to achieve with I am?"** / "Choose at least one to see
  affirmations based on your goals" — 1 Learn to love myself · 2 Personal
  growth · 3 Be more present and enjoy life · 4 Feel more self-confident ·
  5 Develop a positive mindset · 6 Improve my mental health (multi, Continue,
  Skip).

### m. Trial pre-frames and paywall — `key_42_offer_3days.png`, `key_43_trial_reminder_pre.png`, `key_44_paywall_animating.png`, `key_44_paywall.png`, `key_44_paywall_toggle_on.png`

- **42** "We offer 3 days of Premium access for free, just for you" — text-only
  interstitial (serif, centred), CTA **"Try it for free"**.
- **43** "We'll send you a reminder 1 day before your trial ends" (serif, top) /
  "No surprises, no pressure" (sans) / line-art hand holding a phone whose
  screen reads "11:11", a hand-bell and sparkles / CTA **"Try it for free"**.
- **44 Paywall** "How your free trial works" (serif title, top-centred). Vertical
  timeline down the left with a sage-green connector line and four nodes:
  1. outlined circle with check — **~~Install the app~~** (strikethrough) /
     "Set it up to match your goals"
  2. outlined circle with open padlock — **Today - Free trial starts** / "Enjoy
     full access, totally free for your first 3 days"
  3. outlined circle with bell — **Aug 10 - Trial reminder** / "To let you know
     it's ending soon"
  4. **filled** sage-green circle with gem — **Aug 11 - Become member** / "Your
     trial ends unless canceled"
     Titles serif ~19 pt, descriptions grey sans ~14 pt. Entry animation: title
     fades in, nodes appear one by one (~0.25 s apart) while the line draws, then
     the toggle row, CTA, fine print and footer fade in; the close **X** (thin,
     grey, top-left) appears ≈3.2 s after entry. A light shimmer sweeps across the
     CTA every couple of seconds.
     Below the timeline: near-white pill row **"Reminder before trial ends"** with
     an iOS switch (off by default). When switched on the row reads
     "We'll remind you on Aug 10" with a small green shield-check icon at left and
     the switch is green. CTA pill **"Try for $0.00"**; fine print
  "$4.99/month, billed yearly as $59.99/year"; footer links in one row:
     "Restore · Terms & Conditions · Privacy Policy" (small grey sans, not
     underlined). No plan selector, no other price shown.

### n. Attribution (0:11.7–0:19.6) — `key_02_attribution.png`, `key_02_attribution_att_prompt.png`, `key_02_attribution_selected.png`

- "How did you hear about I am?" / "Select an option to continue" — Web search ·
  App Store · Friend/family · TikTok · Instagram · Facebook · Other. Single-select
  auto-advance, no Skip, no Continue. The iOS ATT alert ("Allow “I am” to track
  your activity across other companies' apps and websites?") is shown on top of
  this screen the moment it appears (0:12) and dismissed at 0:17; the user then
  chose "App Store" (row scales up, others fade) and the name screen followed.

### Other saved frames

`key_03_name.png`, `key_04_age.png`, `key_05_gender.png`, `key_06_relationship.png`,
`key_07_employment.png`, `key_08_religion.png`, `key_09_zodiac.png`,
`key_16_mood.png`, `key_17_mood_reason.png`, `key_17_mood_reason_selected.png`,
`key_19_mental_health.png`, `key_20_selfcare_blockers.png`,
`key_30_change_with_affirmations.png`, `key_31_topics.png`,
`key_31_topics_selected.png`, `key_33_icon_style.png`, `key_34_theme.png`,
`key_35_bundle.png`, `key_45_post_lockscreen_widget.png`,
`key_46_post_homescreen_widget.png`, `key_47_app_welcome_swipe.png`,
`key_48_app_feed_tooltip.png`, `key_49_app_streak_banner.png`,
`key_50_app_profile_streak.png`.

Main-app streak/goal UI seen after onboarding (for reference only):

- Feed header pill "♡ 0/5" with a progress bar and a tooltip "Save 5 affirmations
  to personalize your feed" pointing at the heart button; it fills to 5/5 and
  then reads "Your feed's set up! Personalize it even more by adding more
  affirmations to favorites." (`key_48_app_feed_tooltip.png`).
- Banner "New daily streak started" with a pink "1" disc and the same Sa–Fr
  tracker; profile screen card "Your streak" with "1", tracker and "Build a
  streak, one day at a time" (`key_49_app_streak_banner.png`,
  `key_50_app_profile_streak.png`).
- Home-screen widget "Streak tracker" shows an affirmation with a small plant
  icon and streak number.

---

## 3. Interaction & visual grammar

- **Type**: headlines in a warm serif (high-contrast, slightly condensed, similar
  to a "Recoleta/Fraunces" style), ~26 pt, dark brown (≈ #2C1F19), centred, 1–3
  lines, at ~y 180–250 px (≈ 120–165 pt) from the top; sub-headline in a
  geometric sans (DM Sans-like), ~16 pt, same dark brown, centred; option
  labels sans ~17 pt; CTA label sans bold ~17 pt white; Skip sans ~15 pt dark,
  top-right at ~81 pt from top with ~30 pt right inset.
- **Colour**: page background cream ≈ #EBDED8; option pill ≈ #FBEFEE/#FCF5F4;
  selected pill ≈ #FFF6F7; dark brown for CTA, filled radios/checks and text
  ≈ #473535/#443635; streak pink ≈ #EAA8AA–#F4B9BB; paywall accent sage green
  ≈ #88A999 (nodes/line) with iOS green switch; alert/permission dialogs are
  native.
- **Option rows**: full-width pills, 15 pt side margins, ≈53 pt tall,
  ≈11 pt vertical gap, radius = half height; label inset ≈20 pt; a 21 pt
  outlined circle at the right (≈16 pt inset). Single-select: circle becomes a
  dark-brown dot inside a thick muted rose-grey ring; multi-select: circle
  becomes a solid dark-brown disc with a white check. Where icons exist they sit
  left of the label in a fixed column.
- **Auto-advance**: single-select screens have no Continue; the tapped row turns
  white and scales up ~3 %, other rows fade to ~50 %, and after ≈0.4–0.5 s the
  screen transitions. Transition = horizontal slide left with cross-fade,
  ≈0.3 s. Multi-select, chips, text and grid screens use a pinned bottom
  "Continue" pill (dark brown, full width, 15 pt margins, ≈52 pt tall).
- **Chips** (topics): fully rounded chips with a "+" prefix; selected chips turn
  white and swap the "+" for a check; laid out two per row, left-aligned.
- **Grid pickers** (icon, theme): first tile pre-selected with a dark check
  badge; tiles have a light ring when selected; Continue below.
- **Skip**: plain text top-right on most question screens; absent on Welcome,
  attribution, mood, mood-cause, all interstitials, notification setup, icon and
  theme pickers, "What do you want to improve?", the trial pre-frames and the
  paywall.
- **No progress bar or step counter anywhere.** Rhythm: 2–4 quick questions,
  then a text-only interstitial with a Continue.
- **Personalization**: the name typed on screen 3 is reused in headlines 5, 11
  and 16 ("…, Jasmin?").
- **"Try it 3 days for free" caption**: first appears above the Continue button
  on the topics chips screen (2:20, screen 31), again on the icon (33) and theme
  (34) pickers; not on practice modes (32) or any later screen. The trial itself
  is announced on screens 42–43 and the paywall.
- **System dialogs**: ATT immediately on screen 2; notification permission only
  after the custom notification setup (screen 14, "Allow and Save"); App Store
  purchase sheet from the paywall CTA.
- **Post-purchase**: two widget education screens (Lock Screen "Got it!", Home
  Screen "Install widget"/"Remind me later"), then the app.
