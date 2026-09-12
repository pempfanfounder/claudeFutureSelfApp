import type { VariantConfig } from "../engine/types";

/**
 * stella-claude: Claude-original copy on the Stella conversational UX.
 * Spec: docs/ONBOARDING_COPY_STELLA_CLAUDE.md
 */
export const stellaClaude: VariantConfig = {
  id: "stella-claude",
  family: "stella",
  paywallStyle: "note",
  paywallCloseDelayMs: null,
  authSheetBeforePaywall: true,
  steps: [
    {
      id: "welcome",
      type: "welcome",
      headline: "The rest of your life starts quietly.",
      cta: "Continue",
      secondaryCta: "Already have an account? Sign in",
    },
    {
      id: "notifications",
      type: "notifications",
      lines: [
        "Future Self works by finding you during your day: a few of the right words, spread through the hours you choose.",
        "Turn on notifications so today-you can hear from us.",
      ],
      cta: "Turn them on",
      secondaryCta: "Maybe later",
    },
    {
      id: "intro",
      type: "info",
      lines: [
        "Hi. I'm Future Self.",
        "I have a few questions. The kind people rarely stop to answer.",
        "Answer honestly. What you write is for you, never for ads, never for analytics.",
      ],
      cta: "Continue",
    },
    {
      id: "name",
      type: "text",
      lines: ["First, what should I call you?"],
      placeholder: "Your name",
      maxLength: 40,
      modelKey: "name",
    },
    {
      id: "name-ack",
      type: "info",
      lines: [
        (ctx) =>
          ctx.name ? `Good to meet you, ${ctx.name}.` : "Good to meet you.",
      ],
      autoAdvanceMs: 1600,
    },
    {
      id: "age",
      type: "text",
      lines: ["How old are you?"],
      placeholder: "28",
      keyboard: "number-pad",
      maxLength: 3,
      skippable: true,
      modelKey: "raw.age",
    },
    {
      id: "gender",
      type: "chips",
      lines: ["How do you identify?"],
      minSelect: 1,
      maxSelect: 1,
      options: [
        { slug: "female", label: "Female" },
        { slug: "male", label: "Male" },
        { slug: "non-binary", label: "Non-binary" },
        { slug: "na", label: "Prefer not to say" },
      ],
      modelKey: "gender",
    },
    {
      id: "good-day",
      type: "text",
      lines: ["Tell me about a good day. One you'd be glad to repeat."],
      placeholder: "Early start, deep work, dinner with people I love…",
      multiline: true,
      maxLength: 280,
      modelKey: "raw.good_day",
    },
    {
      id: "wasted-day",
      type: "text",
      lines: ["Now the other kind. What does a wasted day look like?"],
      placeholder: "Scrolling, snoozing, promising myself tomorrow…",
      multiline: true,
      maxLength: 280,
      modelKey: "raw.wasted_day",
    },
    {
      id: "frequency",
      type: "chips",
      lines: ["Honestly, how often does the second kind win?"],
      minSelect: 1,
      maxSelect: 1,
      options: [
        { slug: "most-days", label: "Most days" },
        { slug: "often", label: "More than I'd like" },
        { slug: "sometimes", label: "Now and then" },
        { slug: "rarely", label: "Rarely" },
      ],
      modelKey: "motivation_level",
    },
    {
      id: "life-goal",
      type: "text",
      lines: [
        (ctx) =>
          ctx.name
            ? `What are you building toward this year, ${ctx.name}?`
            : "What are you building toward this year?",
      ],
      placeholder: "The version of you that feels out of reach right now…",
      multiline: true,
      maxLength: 280,
      modelKey: "life_goal",
    },
    {
      id: "obstacles",
      type: "chips",
      lines: ["What's been standing between you and that?"],
      minSelect: 1,
      options: [
        { slug: "procrastination", label: "I put it off" },
        { slug: "distraction", label: "I lose focus" },
        { slug: "overwhelm", label: "I burn out" },
        { slug: "self-doubt", label: "I doubt myself" },
        { slug: "motivation", label: "Life keeps happening" },
        { slug: "no-plan", label: "I don't have a plan" },
        { slug: "other", label: "Something else" },
      ],
      modelKey: "obstacles",
    },
    {
      id: "projection",
      type: "chips",
      lines: [
        "Say nothing changes. The same days, five more years. Sit with that for a second.",
        "How does it feel?",
      ],
      minSelect: 1,
      maxSelect: 1,
      options: [
        { slug: "terrifying", label: "Honestly? Terrifying" },
        { slug: "sad", label: "Sad, but familiar" },
        { slug: "refuse", label: "I refuse to find out" },
        { slug: "want-more", label: "I'd survive it, but I want more" },
      ],
      modelKey: "raw.projection",
    },
    {
      id: "pivot",
      type: "info",
      lines: [
        "Then let's not find out.",
        "Picture the version of you who followed through. They exist. They're just further down the road you keep stepping off.",
      ],
      cta: "Continue",
    },
    {
      id: "traits",
      hideProgress: true,
      type: "chips",
      lines: [
        (ctx) =>
          ctx.name
            ? `Three words, ${ctx.name}. Who is that person?`
            : "Three words. Who is that person?",
      ],
      minSelect: 3,
      maxSelect: 3,
      options: [
        { slug: "disciplined", label: "Disciplined" },
        { slug: "calm", label: "Calm" },
        { slug: "confident", label: "Confident" },
        { slug: "strong", label: "Strong" },
        { slug: "free", label: "Free" },
        { slug: "focused", label: "Focused" },
        { slug: "kind", label: "Kind" },
        { slug: "unstoppable", label: "Unstoppable" },
      ],
      modelKey: "future_traits",
    },
    {
      id: "hard-morning",
      hideProgress: true,
      type: "text",
      lines: [
        "Last one. It's the important one.",
        (ctx) => {
          const traits =
            (ctx.answers["future_traits"] as string[] | undefined) ?? [];
          const t1 = traits[0] ?? "stronger";
          const t2 = traits[1] ?? "calmer";
          return `You're having a hard morning. The ${t1}, ${t2} version of you leans in. What do they say?`;
        },
      ],
      placeholder: "Get up. You know why.",
      multiline: true,
      maxLength: 160,
      modelKey: "raw.pinned_affirmation",
    },
    {
      id: "wrap",
      hideProgress: true,
      type: "info",
      lines: [
        "That's everything I need.",
        "I'm putting together your daily direction: the quotes, the affirmations, and the moments in your day they should arrive.",
      ],
      autoAdvanceMs: 3600,
    },
    {
      id: "preparing",
      type: "preparing",
      headline: "Preparing your direction…",
    },
    {
      id: "auth",
      type: "auth-sheet",
      headline: (ctx) =>
        ctx.name ? `Keep it safe, ${ctx.name}.` : "Keep it safe.",
      sub: "Sign in with Apple, Google, or email. Then you can start your trial.",
      condition: (ctx) => ctx.isAnonymous,
    },
    {
      id: "paywall",
      type: "paywall",
    },
    {
      id: "post-auth",
      type: "auth-sheet",
      headline: "One tap so this is never lost.",
      sub: "Your goal, your streak and your saved quotes, safe on any device.",
      secondaryCta: "Not now",
      condition: (ctx) => ctx.isAnonymous,
    },
  ],
};
