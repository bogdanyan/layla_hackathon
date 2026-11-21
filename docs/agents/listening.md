# Listening screen ("Playing around you")

`/nearby` shows people within X km and what they're playing right now, or the last thing they played. It's linked from the bottom tab bar.

## Code
- `src/app/nearby/page.tsx`: the page. Radius comes from `?r=` (one of `RADII_KM` = 1/5/10/25, default 5) and is set with chip links. It includes `<ShareLocation />`, shows an empty state if the viewer isn't sharing (`isSharingLocation`), and calls `ensureFresh` for the viewer.
- `src/lib/nearby.ts`: `getNearbyListening(userId, radiusKm)` returns `NearbyListener[]` (`track`, `status: "playing" | "paused" | "recent" | "none"`, `playedAt`, `distanceLabel`). Order: playing, paused, recent, none; within each, closest first.
  - It calls `refreshNowPlaying` for every nearby user (capped at 30). We hold their tokens, and the 25 s TTL claim keeps Spotify calls cheap.
  - A `nowPlaying` older than 10 min counts as stale. When `nowPlaying` is stale or missing, it falls back to the latest `plays` row (`playToTrack` in `sync.ts`).
- `src/components/auto-refresh.tsx`: `<AutoRefresh ms />` calls `router.refresh()` every 30 s while the tab is visible. Use it for live server-rendered lists.
- `src/components/bottom-nav.tsx`: `<BottomNav />` tab bar (Vibe / Nearby). Add new tabs (e.g. Chat) to `TABS`. Pages that use it need `pb-24`-ish bottom padding.

## Taste matching
The page also shows a "Your taste twins" strip (global top 5) and match % pills on nearby rows. See [taste.md](taste.md).

## Demo users
`npm run db:seed-demo` creates 8 demo users (6 nearby, plus Lena and Omar about 300 km away, who only appear as taste twins) around the most recently located real user, or around `-- <lat> <lng>`. Each radius chip shows something different: 1 km → 1 person, 5 km → 4, 10 km → 5, 25 km → 6. Two are playing, one is paused, and the rest have recent plays. Their tracks are real ones taken from existing `plays`, so the album art is real; avatars come from pravatar.cc. Each one gets top-artist snapshots that copy a set share of the viewer's own top artists (`tasteOverlap`), so match % varies. Remove them with `npm run db:seed-demo -- --clear`.
- Demo users have `spotify_id = "demo:*"` and no tokens. `refreshNowPlaying` skips users without a refresh token, and `nearby.ts` never treats a demo user's now-playing as stale.
- Re-run the seed daily: locations expire after 24h, and the "x min ago" times keep aging.
