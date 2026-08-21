import type { VariantConfig } from "../engine/types";

/**
 * iam-claude: Claude-original copy on the I Am UX framework.
 * Spec: docs/ONBOARDING_COPY_IAM_CLAUDE.md
 *
 * Rhythm follows I Am: bursts of 2–4 quick taps, then a breather
 * (interstitial, notification config, streak visual, science/benefits).
 * Every `raw.*` key lands in raw_answers (Supabase only, never analytics).
 */
export const iamClaude: VariantConfig = {
  id: "iam-claude",
  family: "iam",
  paywallStyle: "timeline",
  paywallCloseDelayMs: 2000,
  authSheetBeforePaywall: false,
  steps: [
    {
      id: "welcome",
      type: "welcome",
      headline: "Become the person you keep promising yourself.",
      sub: "Future Self turns quotes and affirmations into small daily pushes toward the life you actually want.",
      cta: "Begin",
    },
    {
      id: "name",
      type: "text",
      headline: "What should we call you?",
      sub: "Your future self is going to address you by name",
      placeholder: "Your name",
      cta: "Continue",
      skippable: true,
      maxLength: 40,
      modelKey: "name",
    },
    {
      id: "age",
      type: "single",
      headline: (ctx) =>
        ctx.name ? `How old are you, ${ctx.name}?` : "How old are you?",
      sub: "Your age helps us personalize your quotes and affirmations",
      options: [
        { slug: "u18", label: "Under 18" },
        { slug: "18-24", label: "18 to 24" },
        { slug: "25-34", label: "25 to 34" },
        { slug: "35-44", label: "35 to 44" },
        { slug: "45-54", label: "45 to 54" },
        { slug: "55+", label: "55+" },
      ],
      skippable: true,
      modelKey: "raw.age_band",
    },
    {
      id: "motivation",
      type: "single",
      headline: "Where's your motivation right now?",
      sub: "Be honest. We'll meet you where you are",
      options: [
        { slug: "all-in", label: "Ready to change everything", emoji: "🔥" },
        {
          slug: "inconsistent",
          label: "Motivated, but inconsistent",
          emoji: "📈",
        },
        { slug: "empty", label: "Not motivated right now", emoji: "🌫️" },
        { slug: "unsure", label: "I'm not sure yet", emoji: "🤍" },
      ],
      modelKey: "motivation_level",
    },
    {
      id: "gap-interstitial",
      type: "info",
      headline:
        "The person you'll be in five years is being built in the ordinary hours of today.",
      cta: "Continue",
    },
    {
      id: "familiarity",
      type: "single",
      headline: (ctx) =>
        ctx.name
          ? `Where are you with affirmations, ${ctx.name}?`
          : "Where are you with affirmations?",
      sub: "Your answer shapes how we introduce them",
      options: [
        { slug: "new", label: "Never really tried them" },
        { slug: "occasionally", label: "On and off" },
        { slug: "regularly", label: "They're part of my routine" },
      ],
      skippable: true,
      modelKey: "raw.affirmation_familiarity",
    },
    {
      id: "affirmations-intro",
      type: "info",
      headline:
        "Affirmations are short, positive statements you repeat to yourself, until they become how you think.",
      cta: "Continue",
      // Only newcomers get the primer — that is what makes the
      // familiarity sub ("shapes how we introduce them") honest.
      condition: (ctx) => ctx.answers["raw.affirmation_familiarity"] === "new",
    },
    {
      id: "habit-helper",
      type: "multi",
      headline: "What would keep this going day after day?",
      sub: "Choose all that apply",
      minSelect: 1,
      // Every option maps to a real Future Self feature.
      options: [
        { slug: "reminders", label: "Nudges at the right moments" },
        { slug: "progress", label: "Watching my streak build" },
        { slug: "widget", label: "A widget on my Home or Lock Screen" },
        { slug: "fit", label: "Words that match my goals" },
        { slug: "unsure", label: "I don't know yet" },
      ],
      skippable: true,
      modelKey: "raw.habit_helpers",
    },
    {
      id: "repetition",
      type: "info",
      headline:
        "Repetition is how a thought stops being an idea and becomes a belief.",
      cta: "Continue",
    },
    {
      id: "notifications",
      type: "notifications",
      headline: "This is how you won't drift.",
      sub: "Future Self finds you through the day with the quotes you need to hear. You choose how often, and when.",
      cta: "Turn on reminders",
      mockLine: "Discipline is remembering what you want.",
    },
    {
      id: "goals",
      type: "multi",
      headline: "What matters most to you right now?",
      sub: "They shape your daily quotes and affirmations.",
      // No maxSelect: every goal the user actually has should be
      // selectable (feedback round 2026-08-21).
      minSelect: 1,
      options: [
        { slug: "discipline", label: "Discipline & consistency", emoji: "💪" },
        { slug: "confidence", label: "Confidence & self-belief", emoji: "🧠" },
        { slug: "body", label: "Health & energy", emoji: "🩺" },
        { slug: "career", label: "Career & money", emoji: "💼" },
        { slug: "relationships", label: "Relationships", emoji: "❤️" },
        { slug: "peace", label: "Peace of mind", emoji: "🕊️" },
        { slug: "purpose", label: "Purpose & direction", emoji: "🧭" },
      ],
      skippable: true,
      modelKey: "primary_goals",
    },
    {
      id: "obstacles",
      type: "multi",
      headline: "And what keeps getting in the way?",
      sub: "Naming it is the first step",
      minSelect: 1,
      options: [
        { slug: "procrastination", label: "I put things off", emoji: "⏳" },
        { slug: "distraction", label: "My phone eats my day", emoji: "📱" },
        { slug: "motivation", label: "I start strong, then stop", emoji: "🔁" },
        { slug: "overwhelm", label: "I get overwhelmed", emoji: "🌀" },
        { slug: "self-doubt", label: "I doubt myself", emoji: "🪞" },
        { slug: "no-plan", label: "I don't have a clear plan", emoji: "🗺️" },
      ],
      skippable: true,
      modelKey: "obstacles",
    },
    {
      id: "system-interstitial",
      type: "info",
      headline:
        "Consistency isn't a personality trait. It's a system, and you're about to build one.",
      cta: "Continue",
    },
    {
      id: "results-preframe",
      type: "info",
      headline:
        "A few minutes a day is all it takes. Give it a couple of weeks.",
      cta: "Continue",
    },
    {
      id: "time-devotion",
      type: "single",
      headline: "How much time will you give your future self each day?",
      sub: "Small and daily beats big and rare",
      options: [
        { slug: "1", label: "One quiet minute" },
        { slug: "3", label: "Three focused minutes" },
        { slug: "10", label: "Ten unhurried minutes" },
      ],
      skippable: true,
      modelKey: "raw.daily_minutes",
    },
    {
      id: "streak-goal",
      type: "single",
      headline: "How long a streak do you want to chase first?",
      sub: "Pick what feels doable. Your streak keeps counting either way",
      options: [
        { slug: "3", label: "3 days straight" },
        { slug: "7", label: "7 days straight" },
        { slug: "21", label: "21 days straight" },
      ],
      skippable: true,
      modelKey: "raw.streak_goal",
    },
    {
      id: "streak",
      type: "streak-commit",
      headline: "Three readings a day. That's the whole ask.",
      sub: "Read 3 quotes or affirmations and the day counts.",
      info: "Miss a day and the chain breaks.",
      // Echoes the goal picked one screen earlier; 21 when it was skipped.
      cta: (ctx) => `I'm in for ${ctx.answers["raw.streak_goal"] ?? "21"} days`,
      modelKey: "raw.streak_goal",
    },
    {
      id: "traits",
      type: "chips",
      headline: "Meet your future self. What are they like?",
      sub: "Pick the traits you're building toward",
      maxSelect: 4,
      minSelect: 1,
      options: [
        { slug: "disciplined", label: "Disciplined" },
        { slug: "confident", label: "Confident" },
        { slug: "calm", label: "Calm" },
        { slug: "strong", label: "Strong" },
        { slug: "focused", label: "Focused" },
        { slug: "free", label: "Free" },
        { slug: "generous", label: "Generous" },
        { slug: "fulfilled", label: "Fulfilled" },
      ],
      skippable: true,
      modelKey: "future_traits",
    },
    {
      id: "vision",
      type: "single",
      headline: "How clear is the life you're aiming at?",
      sub: "Pick the one that feels true",
      options: [
        { slug: "yes", label: "Sharp. I can picture it" },
        { slug: "working", label: "Getting clearer" },
        { slug: "day-by-day", label: "I mostly take it day by day" },
        { slug: "no", label: "Honestly, still blurry" },
      ],
      skippable: true,
      modelKey: "raw.vision",
    },
    {
      id: "belief-manifestation",
      type: "single",
      headline: "Where do you stand on manifestation?",
      sub: "No right answer here",
      options: [
        { slug: "yes", label: "I'm a believer" },
        { slug: "curious", label: "Curious, not convinced" },
        { slug: "no", label: "It's not for me" },
      ],
      skippable: true,
      modelKey: "raw.belief_manifestation",
    },
    {
      id: "belief-thoughts",
      type: "single",
      headline: "Can the way you think change how your life goes?",
      sub: "Pick the one that feels true",
      options: [
        { slug: "yes", label: "I've watched it happen" },
        { slug: "open", label: "Maybe. I'm open" },
        { slug: "no", label: "I don't think so" },
      ],
      skippable: true,
      modelKey: "raw.belief_thoughts",
    },
    {
      id: "belief-rewire",
      type: "single",
      // Kept as a question, not a statement: the app never asserts a
      // neuroscience claim it cannot cite.
      headline: "Have you heard that affirmations can reshape how you think?",
      sub: "Whatever you answer is fine",
      options: [
        { slug: "yes", label: "Yes, and I buy it" },
        { slug: "unsure", label: "Heard of it, still unsure" },
        { slug: "tell-me", label: "News to me. Go on" },
        { slug: "skeptical", label: "Skeptical, but listening" },
      ],
      skippable: true,
      modelKey: "raw.belief_rewire",
    },
    {
      id: "science",
      type: "info",
      // Claim wording stays inside what the cited papers support: the
      // meta-analytic effects are small, the future-orientation result is
      // a brain-activation contrast, not a proven outcome difference.
      // See docs/ONBOARDING_CLAIMS_AND_IP_REVIEW.md section A.
      headline:
        "Research links self-affirmation to greater well-being, less stress and more follow-through on goals.",
      sub: "Brain-imaging research shows it engages the brain's reward and self-processing centers, especially when people imagine their future.",
      footnote:
        "Cohen & Sherman, Annual Review of Psychology (2014) · Zhang et al., American Psychologist (2025) · Cascio et al., Social Cognitive and Affective Neuroscience (2016)",
      cta: "Continue",
    },
    {
      id: "benefits",
      type: "info",
      headline: "What a daily practice can do",
      bullets: [
        "Keep your goals in sight",
        "Soften negative self-talk",
        "Support your mental well-being",
      ],
      cta: "Got it",
    },
    {
      id: "quote-topics",
      type: "chips",
      headline: "Which voices push you hardest?",
      sub: "We'll weight your daily quotes toward these",
      minSelect: 1,
      options: [
        { slug: "discipline", label: "Discipline" },
        { slug: "ambition", label: "Ambition" },
        { slug: "courage", label: "Courage" },
        { slug: "stoic-calm", label: "Stoic calm" },
        { slug: "gratitude", label: "Gratitude" },
        { slug: "resilience", label: "Resilience" },
        { slug: "focus", label: "Focus" },
        { slug: "kindness", label: "Kindness" },
      ],
      skippable: true,
      modelKey: "quote_interests",
    },
    {
      id: "affirmation-topics",
      type: "chips",
      headline: "And what do you need to hear more often?",
      sub: "Your affirmations will lean this way",
      minSelect: 1,
      options: [
        { slug: "self-belief", label: "Self-belief" },
        { slug: "calm", label: "Calm under pressure" },
        { slug: "health-body", label: "Health & body" },
        { slug: "abundance", label: "Abundance" },
        { slug: "letting-go", label: "Letting go" },
        { slug: "morning-energy", label: "Morning energy" },
        { slug: "boundaries", label: "Boundaries" },
        { slug: "self-respect", label: "Self-respect" },
      ],
      skippable: true,
      trialCaption: true,
      modelKey: "affirmation_interests",
    },
    {
      id: "practice-mode",
      type: "multi",
      // The subject is the words, not "your future self" as a person.
      headline: "How will you use your quotes and affirmations?",
      sub: "Choose at least one",
      minSelect: 1,
      // No "listening" option: the app has no audio.
      options: [
        { slug: "phone", label: "Reading them in the app" },
        { slug: "widget", label: "Seeing them on my Home or Lock Screen" },
        { slug: "aloud", label: "Saying them out loud" },
        { slug: "journal", label: "Writing them in a journal" },
        { slug: "post-it", label: "Writing them on a post-it" },
        { slug: "unsure", label: "I'm not sure yet" },
      ],
      skippable: true,
      modelKey: "raw.practice_modes",
    },
    {
      // I Am screen 33: icon picker right before the theme picker. The
      // choice is recorded here and applied once at completion — iOS
      // shows a system alert on every icon change.
      id: "app-icon",
      type: "app-icon",
      headline: "Pick the icon you want to see every day.",
      sub: "This becomes Future Self's icon on your Home Screen. Change it anytime.",
      trialCaption: true,
      cta: "Continue",
      modelKey: "raw.app_icon",
    },
    {
      id: "theme",
      type: "theme",
      headline: "Choose how your words should look.",
      sub: "You can change this anytime, or build your own",
      trialCaption: true,
      cta: "Continue",
    },
    {
      id: "life-goal",
      type: "text",
      headline: "Finish the sentence: a year from now, I want to be…",
      sub: "Your words. They'll follow you through the app, and onto your Home Screen if you want.",
      placeholder: "…someone who shows up every single day",
      multiline: true,
      maxLength: 280,
      cta: "Save it",
      skippable: true,
      modelKey: "life_goal",
    },
    {
      id: "achieve",
      type: "multi",
      headline: "A year in, what should have changed?",
      sub: "Choose at least one",
      minSelect: 1,
      options: [
        // Kept short so each answer stays a single row on a 6.1" phone.
        { slug: "best-self", label: "I'm the person I imagined" },
        { slug: "discipline", label: "Discipline that holds" },
        { slug: "confidence", label: "I trust myself more" },
        { slug: "mindset", label: "My thinking got lighter" },
        { slug: "presence", label: "I'm present, not rushing" },
        { slug: "mental-health", label: "I care for my mental well-being" },
      ],
      skippable: true,
      // Last question before the result/paywall.
      trialCaption: true,
      modelKey: "raw.outcome_goals",
    },
    {
      id: "result",
      type: "result",
      cta: "Sounds right",
    },
    {
      id: "source",
      type: "single",
      headline: "One last thing: how did you find us?",
      sub: "It helps a small team keep showing up there",
      options: [
        { slug: "web", label: "Web search" },
        { slug: "app-store", label: "App Store" },
        { slug: "friend", label: "Friend or family" },
        { slug: "tiktok", label: "TikTok" },
        { slug: "instagram", label: "Instagram" },
        { slug: "other", label: "Other" },
      ],
      skippable: true,
      modelKey: "raw.source",
    },
    {
      id: "trial-preframe",
      type: "info",
      headline: (ctx) =>
        ctx.trialLength
          ? `Everything unlocked, free for ${ctx.trialLength}.`
          : "Everything unlocked from day one.",
      sub: "No surprises: we'll remind you before the trial ends, and you can cancel anytime.",
      cta: "Show me how it works",
      condition: (ctx) => ctx.trialLength !== null,
    },
    {
      id: "paywall",
      type: "paywall",
    },
    {
      id: "widget-lock",
      type: "widget-promo",
      headline: "Put your future on your Lock Screen.",
      sub: "See your words without unlocking your phone",
      cta: "Got it",
      placeholder: "I will not waste today.",
    },
    {
      id: "widget-home",
      type: "widget-promo",
      headline: "One more: your Home Screen.",
      sub: "Touch and hold your Home Screen, tap Edit, and add Future Self",
      cta: "Got it",
      placeholder: "A year from now, you'll be glad you started today.",
    },
  ],
};
