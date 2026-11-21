# Summary & Vibe page (MVP 1)

`/` (signed in) shows the user's vibe, a listener profile, this week's stats, trends, "on repeat", top artists, a concerts placeholder and a Share-to-story button. The raw synced data lives at `/data`.

## Principle: numbers from code, words from the LLM
- `src/lib/summary.ts` → `getSummaryFacts(userId)` computes **every number shown**: this week vs. last week (plays, minutes, top artists/tracks from `plays`), peak time of day in the user's timezone, plus from Spotify's top-list snapshots: `newDiscoveries` (4-week top only), `staples` (in all ranges), `rising`, and `likedThisWeek`.
- `toLLMInput(facts)` turns those facts into compact names and counts. That is the **only** LLM input, and its hash decides when to regenerate.
- The LLM writes words only. Its system prompt forbids invented stats, concerts or events, and asks for an "early days" tone when history is short.

## LLM output (`src/lib/vibe.ts`)
`SummarySchema` (zod, used with `generateJSON` from `src/lib/llm.ts`):
```
vibe:    { title, emoji, tagline, moods[], colors[3 hex] }
profile: { headline, description, traits[3]: { label, explanation } }
trends:  [{ emoji, title, detail }]   // 2–4
```
The schema is kept plain because structured outputs support only a JSON Schema subset. Counts and hex colors are enforced afterwards in `clean()`.

- `getOrCreateSummary(userId)`: for pages. Returns the cached summary instantly (and refreshes it in `after()` if older than 6 h). If none exists, it generates one inline. The page renders it inside `<Suspense>`, so it streams in after roughly 10 s while the stats show immediately.
- `refreshSummary(userId, { force })`: calls the LLM only if the input hash changed **and** the last summary is over 6 h old (`VIBE_TTL_MS`). There's one in-flight generation per user. It's a no-op without `ANTHROPIC_API_KEY`.
- `getLatestSummary(userId)`: DB only. Rows in an older format are ignored, which triggers regeneration.
- **Changing the prompt or schema:** edit `SYSTEM` / `SummarySchema`, then **bump `PROMPT_VERSION`** so cached summaries regenerate.
- Old names `refreshVibe` / `getLatestVibe` are kept as aliases.

## Page (`src/app/summary.tsx`)
- Deterministic sections render instantly from `getSummaryFacts`.
- Two LLM sections (hero + profile, and trends) share one `cache()`d `getOrCreateSummary` call.
- `ensureFresh` keeps the synced data fresh (see [sync.md](sync.md)).

## Share to story
- `GET /api/story` (`src/app/api/story/route.tsx`): a 1080×1920 PNG via `next/og` `ImageResponse`. Flexbox only (every multi-child `div` needs `display: flex`); emoji render via twemoji. Returns 404 until a summary exists.
- `<ShareStory />` (`src/components/share-story.tsx`) prefetches the PNG on mount, because iOS only allows `navigator.share` right after the tap. It opens the native share sheet with the file (Instagram Stories, WhatsApp…), or downloads the PNG where file sharing isn't supported (desktop, or plain http on phones).

## Timezone
`users.timezone` is set by `<TimezoneSync />`, which calls the `setTimezone` server action in `src/app/actions.ts` with the browser's IANA zone. The first time it's set, the summary is regenerated so the "peak time" uses local hours. `getListeningStats` groups by hour in that timezone (UTC when unknown).

## Concerts
Placeholder card only ("coming soon", with top 3 artists). To make it real, fetch events for `facts.topArtists4Weeks` from a concerts API (e.g. Ticketmaster Discovery) in a new `src/lib/concerts.ts`. **Never** ask the LLM for concerts.
