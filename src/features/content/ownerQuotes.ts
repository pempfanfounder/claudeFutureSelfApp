/**
 * The owner's official quote list — the single source of truth for every
 * quote the app ships. `docs/OWNER_QUOTE_LIST.md` documents the list, the
 * `owner_quotes` migration seeds it into `content_items`, and
 * `LOCAL_CATALOG` serves it in mock/staging builds; a test keeps all
 * three in sync with this file.
 *
 * Editing rules (owner instruction): fix typos and add a trailing "." where
 * a sentence lacks one, but never change the words of a quote. Applied fixes
 * are limited to dont→don't, doesnt→doesn't, cant→can't, Everyday→Every day,
 * and straight-apostrophe normalization.
 *
 * `n` is the owner's numbering (1–66). #10 is missing because the source
 * was truncated ("The graveyard is full of people who thought they ha").
 * #54 and #65 are near-duplicates kept intentionally, as written.
 *
 * `categories` use the app's eight quote slugs and are editorial
 * assignments made for personalization weighting, not owner-supplied data.
 */
export interface OwnerQuote {
  /** Position in the owner's list. */
  n: number;
  body: string;
  categories: readonly string[];
}

/** Owner's #10 was truncated in the source and is intentionally excluded. */
export const EXCLUDED_OWNER_QUOTE_NUMBERS: readonly number[] = [10];

export const OWNER_QUOTES: readonly OwnerQuote[] = [
  {
    n: 1,
    body: "If you don't sacrifice for the life you want, the life you want will become the sacrifice.",
    categories: ["discipline", "ambition"],
  },
  {
    n: 2,
    body: "Until death, all defeat is psychological.",
    categories: ["resilience", "stoic-calm"],
  },
  {
    n: 3,
    body: "We suffer more in imagination than in reality.",
    categories: ["stoic-calm"],
  },
  {
    n: 4,
    body: "Don't fall into the trap of analysis paralysis.",
    categories: ["focus", "courage"],
  },
  {
    n: 5,
    body: "A winner is just a loser who tried one more time.",
    categories: ["resilience"],
  },
  {
    n: 6,
    body: "If you don't have that story of pain, then you don't have a story at all.",
    categories: ["resilience"],
  },
  {
    n: 7,
    body: "Are you gonna let the opportunity pass by, or are you gonna give it all you can?",
    categories: ["courage", "ambition"],
  },
  {
    n: 8,
    body: "What a privilege it is to be exhausted from work that you used to pray for.",
    categories: ["gratitude"],
  },
  {
    n: 9,
    body: "Success is a decision.",
    categories: ["ambition", "discipline"],
  },
  {
    n: 11,
    body: "Every day your window of opportunity gets smaller and smaller …",
    categories: ["ambition", "focus"],
  },
  {
    n: 12,
    body: "People who bring you down are by definition below you.",
    categories: ["stoic-calm", "resilience"],
  },
  {
    n: 13,
    body: "A man that doesn't keep his word is no man at all.",
    categories: ["discipline"],
  },
  {
    n: 14,
    body: "No revenge because I'll be the most successful guy she's ever talked to.",
    categories: ["ambition"],
  },
  {
    n: 15,
    body: "Never let less successful people tell you what your limit is.",
    categories: ["ambition", "courage"],
  },
  {
    n: 16,
    body: "We can stay here, or we can go up.",
    categories: ["ambition"],
  },
  {
    n: 17,
    body: "In another life? No bro, this one. Get after it.",
    categories: ["courage", "ambition"],
  },
  {
    n: 18,
    body: "If you don't master your time, someone else will.",
    categories: ["discipline", "focus"],
  },
  {
    n: 19,
    body: "Time doesn't care who wastes it, it just moves on.",
    categories: ["discipline", "focus"],
  },
  {
    n: 20,
    body: "Don't be the 35 year old man wondering what he even did with his 20s.",
    categories: ["ambition", "discipline"],
  },
  {
    n: 21,
    body: "Give something your all.",
    categories: ["discipline"],
  },
  {
    n: 22,
    body: "The world is yours.",
    categories: ["ambition"],
  },
  {
    n: 23,
    body: "You can't have a top tier life without a top tier mindset.",
    categories: ["ambition", "discipline"],
  },
  {
    n: 24,
    body: "Do it for the scared kid.",
    categories: ["courage", "resilience"],
  },
  {
    n: 25,
    body: "Do it for the kid who felt alone, unheard, and forgotten.",
    categories: ["resilience", "kindness"],
  },
  {
    n: 26,
    body: "Do it for the kid who doubted himself every single day.",
    categories: ["resilience", "courage"],
  },
  {
    n: 27,
    body: "Do it for the kid who needed someone to believe in him.",
    categories: ["courage", "resilience"],
  },
  {
    n: 28,
    body: "It's not over until I win.",
    categories: ["resilience"],
  },
  {
    n: 29,
    body: "You are gonna win in the end.",
    categories: ["resilience", "courage"],
  },
  {
    n: 30,
    body: "Why be worried about a girl when there's kids your age doing 100k months?",
    categories: ["focus", "ambition"],
  },
  {
    n: 31,
    body: "There are men who had nothing last year - they took action, and now they are running empires.",
    categories: ["ambition", "courage"],
  },
  {
    n: 32,
    body: "There will come a day when your body can't keep up with your ambition, and on that day, you'll pray for just one more chance to go all in.",
    categories: ["ambition", "discipline"],
  },
  {
    n: 33,
    body: "One moment of savage clarity can change your entire life onward.",
    categories: ["focus", "courage"],
  },
  {
    n: 34,
    body: "You don't have time.",
    categories: ["discipline", "focus"],
  },
  {
    n: 35,
    body: "You survived days you never thought you'd make it through. The strength you are looking for is already inside you.",
    categories: ["resilience", "courage"],
  },
  {
    n: 36,
    body: "Everything you think you own, you'll lose one day. Everything is temporary. Embrace it, it's liberating.",
    categories: ["stoic-calm", "gratitude"],
  },
  {
    n: 37,
    body: "Dad's getting older, mom's getting tired. It's now or never.",
    categories: ["ambition", "gratitude"],
  },
  {
    n: 38,
    body: "And when you see me with everything I've ever wanted, just know I probably worked harder than you.",
    categories: ["discipline", "ambition"],
  },
  {
    n: 39,
    body: "God gave you that dream for a reason.",
    categories: ["courage", "ambition"],
  },
  {
    n: 40,
    body: "It's 2030, south of France, and you just made 8.7 million last month.",
    categories: ["ambition"],
  },
  {
    n: 41,
    body: "I thought you wanted this.",
    categories: ["discipline"],
  },
  {
    n: 42,
    body: "Pick yourself up, and get back to work.",
    categories: ["resilience", "discipline"],
  },
  {
    n: 43,
    body: "Remember who you are.",
    categories: ["courage", "focus"],
  },
  {
    n: 44,
    body: "When someone teaches you how to fish, you don't fish in their pond.",
    categories: ["kindness"],
  },
  {
    n: 45,
    body: "Chase happiness and you'll end up on the dopamine treadmill. Chase being proud of yourself and you'll end up happy.",
    categories: ["focus", "discipline"],
  },
  {
    n: 46,
    body: "Success is the ultimate revenge.",
    categories: ["ambition", "resilience"],
  },
  {
    n: 47,
    body: "Some wake up at 25, some at 16. Most? They never wake up.",
    categories: ["focus", "ambition"],
  },
  {
    n: 48,
    body: '"Maybe in another life." No, you only have this one. Make it happen.',
    categories: ["courage", "ambition"],
  },
  {
    n: 49,
    body: "She better cook like her mom, cuz I definitely make more money than her dad.",
    categories: ["ambition"],
  },
  {
    n: 50,
    body: "I just want to make my people proud.",
    categories: ["gratitude", "kindness"],
  },
  {
    n: 51,
    body: "If no one believes in you, believe in yourself.",
    categories: ["courage", "resilience"],
  },
  {
    n: 52,
    body: "Don't wish for it, work for it.",
    categories: ["discipline"],
  },
  {
    n: 53,
    body: "Bro, I am counting on you.",
    categories: ["kindness", "discipline"],
  },
  {
    n: 54,
    body: "While you are overthinking, someone dumber than you is having the success you could have had - just by trying.",
    categories: ["courage", "focus"],
  },
  {
    n: 55,
    body: "If I play, I play to win.",
    categories: ["ambition", "courage"],
  },
  {
    n: 56,
    body: "Do it because they said you couldn't.",
    categories: ["courage", "resilience"],
  },
  {
    n: 57,
    body: "Comfort will deter you from your goal. Don't be stuck in comfort.",
    categories: ["discipline"],
  },
  {
    n: 58,
    body: "Chase something bigger.",
    categories: ["ambition"],
  },
  {
    n: 59,
    body: "Simply refuse to end on a loss. One day you will win.",
    categories: ["resilience"],
  },
  {
    n: 60,
    body: "Regret exists because time is limited. Regret is a product of scarcity. Scarcity of time.",
    categories: ["stoic-calm", "focus"],
  },
  {
    n: 61,
    body: "You have to want it more than your fear wants you to stop.",
    categories: ["courage"],
  },
  {
    n: 62,
    body: "The graveyards are full of men who swore they'd start tomorrow.",
    categories: ["discipline", "courage"],
  },
  {
    n: 63,
    body: "The saddest thing in life is laying on your death bed realizing you still had more gas left in the tank.",
    categories: ["ambition", "resilience"],
  },
  {
    n: 64,
    body: "Try to constantly be in rooms you don't deserve to be in.",
    categories: ["courage", "ambition"],
  },
  {
    n: 65,
    body: "While you are overthinking, someone less intelligent than you is becoming successful just by trying.",
    categories: ["courage", "focus"],
  },
  {
    n: 66,
    body: "You gotta be more afraid of wasting your life than being embarrassed of what other people think of you.",
    categories: ["courage", "discipline"],
  },
];

/**
 * Mirrors the seed convention: bodies over 140 characters are not pushed
 * (the picker additionally hard-caps at 178). Long lines stay in the feed.
 */
export const NOTIFICATION_BODY_MAX = 140;

export function isNotificationEligible(body: string): boolean {
  return body.length <= NOTIFICATION_BODY_MAX;
}
