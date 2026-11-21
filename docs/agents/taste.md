# Taste matching

This ranks **everyone in the app** by music-taste similarity to the viewer. It's deterministic: no LLM, no graph DB. Spotify no longer returns `genres` for our app, so matching uses **shared artists**.

## Algorithm (`src/lib/taste.ts`)
- **Vector per user:** a map of `artistId → weight`, built from four sources:
  - the latest `top_artists:{short,medium,long}_term` snapshots, with rank `i` of `n` weighted `1 - i/n`;
  - artist play counts from `plays` in the last 30 days.
  - Each source is normalized to sum to 1, then weighted: short 3, medium 2, long 1, plays 2.
- **Score:** cosine similarity, shown as `round(sqrt(cos) * 100)`. The sqrt keeps typical partial overlap from looking tiny.
- **Shared artists:** artists both users have, ordered by `min(weightA, weightB)`.

## API
- `getTasteMatches(userId)` returns `{ userId, displayName, imageUrl, score, shared[] }[]`, highest score first, scores > 0 only. It returns `[]` if the viewer has no data yet. It's wrapped in React `cache()`, so calling it from several components in one request computes once.
- `getTasteVectors()`, `similarity(a, b)`, `sharedArtists(a, b, n)` are the building blocks.
- `getDistanceLabels(viewerId, ids)` (in `location.ts`) returns distance buckets for arbitrary users. Beyond 40 km the label is "far away".

## Where it's shown
On `/nearby` (see [listening.md](listening.md)):
- a **"Your taste twins"** strip with the top 5 matches, global, with distance if known;
- a **"N% match"** pill on each nearby row, plus "You both: …" when the score is ≥ 40.

## Caveats
- All vectors are computed per request. That's fine for a few hundred users; add caching (e.g. `"use cache"` with a short `cacheLife`) if the user count grows.
- New users with no snapshots or plays get no matches until their first sync.
