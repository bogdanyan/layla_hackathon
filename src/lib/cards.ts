// Shared look of the Summary cards: used by the web cards (src/app/summary.tsx)
// and the matching story images (src/app/api/story), so shared stories look like the app.

export const CARDS = ["vibe", "week", "listener", "trends"] as const;
export type CardKind = (typeof CARDS)[number];

export const CARD_LABEL: Record<CardKind, string> = {
  vibe: "My vibe right now",
  week: "My week in music",
  listener: "Me as a listener",
  trends: "My music trends",
};

const FALLBACK = ["#1db954", "#0f3d2a", "#191414"];

/** CSS gradient for a card, built from the vibe's 3 colors (each card gets its own variation). */
export function cardGradient(colors: string[] | undefined, card: CardKind) {
  const [a, b, c] = colors?.length === 3 ? colors : FALLBACK;
  switch (card) {
    case "vibe":
      return `linear-gradient(150deg, ${a}, ${b}, ${c})`;
    case "week":
      return `linear-gradient(200deg, ${c}, ${a})`;
    case "listener":
      return `linear-gradient(120deg, ${b}, ${c})`;
    case "trends":
      return `linear-gradient(30deg, ${a}, ${c}, ${b})`;
  }
}

/**
 * Spotify album art URLs encode their size; we store the 64px one. Ask for 300px for cards/stories.
 * (Unknown URL formats are returned unchanged.)
 */
export function albumArt(url: string | null | undefined, size: 300 | 640 = 300) {
  if (!url) return null;
  return url.replace("ab67616d00004851", size === 640 ? "ab67616d0000b273" : "ab67616d00001e02");
}
