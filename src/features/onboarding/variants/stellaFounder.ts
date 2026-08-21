import type { VariantConfig } from "../engine/types";

/**
 * stella-founder: founder ideas (possibleonboardingcopy.md) on the
 * Stella conversational UX — the whole conversation is with your
 * future self. Spec: docs/ONBOARDING_COPY_STELLA_FOUNDER.md
 */
export const stellaFounder: VariantConfig = {
  id: "stella-founder",
  family: "stella",
  paywallStyle: "note",
  paywallCloseDelayMs: null,
  authSheetBeforePaywall: true,
  steps: [
    {
      id: "welcome",
      type: "welcome",
      headline: "Everything I become starts with what you do today.",
      cta: "Continue",
      secondaryCta: "Already have an account? Sign in",
    },
    {
      id: "notifications",
      type: "notifications",
      lines: [
        "There will be moments today when you drift. This app would like to catch a few of them.",
        "Turn on notifications: a few of the right words, in the hours you choose.",
      ],
      cta: "Turn them on",
      secondaryCta: "Maybe later",
    },
    {
      id: "intro",
      type: "info",
      lines: [
        "Hey. It's me, your future self.",
        "I know how that sounds. Stay with me.",
        "I exist because of what you do today. So I have questions.",
      ],
      cta: "Continue",
    },
    {
      id: "name",
      type: "text",
      lines: ["Start simple. What's our name?"],
      placeholder: "Our name",
      maxLength: 40,
      modelKey: "name",
    },
    {
      id: "name-ack",
      type: "info",
      lines: [
        (ctx) =>
          ctx.name ? `${ctx.name}. Still a good name.` : "Still a good name.",
      ],
      autoAdvanceMs: 1600,
    },
    {
      id: "gender",
      type: "chips",
      lines: ["Which best describes us?"],
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
      id: "readiness",
      type: "chips",
      lines: [
        "I need to know something first.",
        "Are you ready to change the direction of our life?",
      ],
      minSelect: 1,
      maxSelect: 1,
      options: [
        { slug: "waiting", label: "Yes. I've been waiting" },
        { slug: "think-so", label: "I think so" },
        { slug: "want-to", label: "I want to be" },
        { slug: "not-sure", label: "Honestly, not sure" },
      ],
      modelKey: "raw.readiness",
    },
    {
      id: "motivation",
      type: "chips",
      lines: ["How badly do you want this right now?"],
      minSelect: 1,
      maxSelect: 1,
      options: [
        { slug: "everything", label: "I'm ready to give it everything" },
        {
          slug: "inconsistent",
          label: "I'm motivated, I just can't stay consistent",
        },
        { slug: "stuck", label: "I want change, but I feel stuck" },
        { slug: "figuring-out", label: "I'm still figuring out what I want" },
        { slug: "exploring", label: "I'm mostly exploring" },
      ],
      modelKey: "motivation_level",
    },
    {
      id: "areas",
      type: "chips",
      lines: ["Where do you need me first?"],
      minSelect: 1,
      maxSelect: 3,
      options: [
        { slug: "body", label: "Our body" },
        { slug: "career", label: "Career or business" },
        { slug: "money", label: "Money & security" },
        { slug: "focus", label: "Focus & consistency" },
        { slug: "peace", label: "Confidence & peace" },
        { slug: "relationships", label: "The people we love" },
        { slug: "other", label: "Something else" },
      ],
      modelKey: "primary_goals",
    },
    {
      id: "life-goal",
      type: "text",
      lines: [
        "Now say it properly. What's the life you're trying to build for us?",
      ],
      placeholder: "Don't be modest. I already know how it ends…",
      multiline: true,
      maxLength: 280,
      modelKey: "life_goal",
    },
    {
      id: "obstacles",
      type: "chips",
      lines: ["And what keeps stopping us?"],
      minSelect: 1,
      options: [
        { slug: "procrastination", label: "We put things off" },
        { slug: "distraction", label: "We get distracted" },
        { slug: "motivation", label: "We lose motivation" },
        { slug: "overwhelm", label: "We get overwhelmed" },
        { slug: "self-doubt", label: "We doubt ourselves" },
        { slug: "no-plan", label: "We don't know where to start" },
        { slug: "on-track", label: "We're moving. Keep it that way" },
        { slug: "other", label: "Something else" },
      ],
      modelKey: "obstacles",
    },
    {
      id: "pivot",
      type: "info",
      lines: [
        "Can I tell you something?",
        "The reason you want it so badly is because I already have it.",
        "All of it. It's waiting on the other side of your ordinary days.",
      ],
      cta: "Continue",
    },
    {
      id: "traits",
      type: "chips",
      lines: ["Describe me. Three words, the ones you're building toward."],
      minSelect: 3,
      maxSelect: 3,
      options: [
        { slug: "disciplined", label: "Disciplined" },
        { slug: "confident", label: "Confident" },
        { slug: "calm", label: "Calm" },
        { slug: "healthy", label: "Healthy" },
        { slug: "wealthy", label: "Wealthy" },
        { slug: "focused", label: "Focused" },
        { slug: "resilient", label: "Resilient" },
        { slug: "free", label: "Free" },
      ],
      modelKey: "future_traits",
    },
    {
      id: "hard-mode",
      hideProgress: true,
      type: "chips",
      lines: ["What do you want to hear from me when it gets hard?"],
      minSelect: 1,
      maxSelect: 1,
      options: [
        { slug: "self-belief", label: "Remind me why I started" },
        { slug: "discipline", label: "Be hard on me, kindly" },
        { slug: "calm", label: "Calm me down" },
        { slug: "gratitude", label: "Celebrate the small wins" },
      ],
      modelKey: "affirmation_interests",
    },
    {
      id: "result",
      hideProgress: true,
      type: "info",
      lines: [
        (ctx) =>
          ctx.name
            ? `That's all I needed, ${ctx.name}.`
            : "That's all I needed.",
        (ctx) => {
          const motivation = ctx.answers["motivation_level"];
          if (motivation === "everything" || motivation === "inconsistent") {
            return "That hunger you just admitted? It's exactly what this was built for.";
          }
          return "You answered honestly. That's rarer than motivation, and it's enough.";
        },
        (ctx) => {
          const traits =
            (ctx.answers["future_traits"] as string[] | undefined) ?? [];
          const t =
            traits.length === 3
              ? `${traits[0]}, ${traits[1]}, ${traits[2]}`
              : "stronger";
          return `I'm building our daily plan now: the quotes, the affirmations, the check-ins. Everything aimed at the ${t} version of us.`;
        },
      ],
      cta: "Continue",
    },
    {
      id: "preparing",
      type: "preparing",
      headline: "Building our plan…",
    },
    {
      id: "auth",
      type: "auth-sheet",
      headline: (ctx) =>
        ctx.name ? `Don't lose us, ${ctx.name}.` : "Don't lose us.",
      sub: "Sign in so our goal, our streak and our words survive a lost phone.",
      secondaryCta: "Not now",
    },
    {
      id: "paywall",
      type: "paywall",
    },
    {
      id: "post-auth",
      type: "auth-sheet",
      headline: "One tap so we're never lost.",
      sub: "Our goal, our streak, our words, safe on any device.",
      secondaryCta: "Not now",
      condition: (ctx) => ctx.isAnonymous,
    },
  ],
};
