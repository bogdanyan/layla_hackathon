# Spotify sync + vibe cache

Spotify data is copied into Postgres periodically. Pages and the LLM read from the DB, never live from Spotify. Spotify only exposes the **last 50 plays**, so syncing regularly is also the only way to build listening history and trends.

## Tables (`src/db/schema.ts`)
- `plays`: one row per play (flat columns: `trackName`, `artistNames[]`, `playedAt`…). Unique on (`userId`, `playedAt`), so re-syncs never duplicate rows. Query it with SQL for trends.
- `spotify_snapshots`: timestamped JSON copies of `profile`, `top_artists:<range>`, `top_tracks:<range>` (ranges `short_term|medium_term|long_term`), `liked`, `playlists`, `albums`, `following`, `shows`. A new row is written **only when the content hash changes** (image URLs are ignored). The latest row per kind is the current state, and older rows form a history.
- `vibes`: the generated summary JSON (`SummarySchema`, see [summary.md](summary.md)) plus an `inputHash`. The latest valid row is the current one.
- `users`: `lastSyncedAt`, `syncErrors` (per kind, with `needsReauth`), `nowPlaying` (trimmed track or null), `nowPlayingAt`.

## Code
- `src/lib/sync.ts`
  - `syncUser(userId, { force })`: atomically claims the user (skips if synced within `SYNC_TTL_MS` = 15 min), fetches everything in parallel, and writes plays and changed snapshots. Per-kind errors go to `users.syncErrors`.
  - `refreshNowPlaying(userId)`: one call, at most once per `NOW_PLAYING_TTL_MS` (25 s).
  - Reads: `getLatestSnapshots(userId).get(kind)` returns `{ data, fetchedAt }` (typed per kind); `getRecentPlays(userId)`; `getListeningStats(userId, days)` returns top artists/tracks by plays, plays by hour (UTC), and totals.
- `src/lib/vibe.ts`
  - The LLM summary (vibe, profile, trends). See [summary.md](summary.md): `getOrCreateSummary`, `refreshSummary`, `getLatestSummary` (old names `refreshVibe`/`getLatestVibe` still work).
  - `ensureFresh(userId)`: call it while rendering any page showing a user's Spotify data. The first sync runs inline; after that, stale data is synced and the summary refreshed in `after()`.
- `src/app/actions.ts`: `refreshSpotify()`, the "Refresh" button (forced sync).
- `src/app/api/now-playing/route.ts`: `GET` returns the current user's `{ nowPlaying }`, refreshing it from Spotify if it's older than the TTL.
- `src/components/now-playing.tsx`: `<NowPlaying initial={...} />` client component. It polls that route every 30 s while the tab is visible, pauses when hidden, and refetches on return. Reuse this pattern for live data on the Listening screen.
- `src/components/track-row.tsx`: shared presentational `TrackRow` / `Row` / `Img` / `Empty`, usable from both server and client components.
- `src/app/api/cron/sync/route.ts`: `GET` with `Authorization: Bearer $CRON_SECRET`. Syncs all users and refreshes vibes.

## Running the cron
- Locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/sync`
- Deployed: Vercel Cron (sends the header automatically; the Hobby plan runs only once a day) or an external pinger such as cron-job.org every 30–60 min. At more than 50 plays between syncs, the gap is lost history.

## Usage
```ts
import { getLatestSnapshots, getListeningStats, getRecentPlays } from "@/lib/sync";
import { ensureFresh, getLatestSummary } from "@/lib/vibe";

await ensureFresh(userId);                               // in a page, inside <Suspense> after connection()
const top = (await getLatestSnapshots(userId)).get("top_artists:short_term")?.data.items;
const stats = await getListeningStats(userId, 7);
const summary = await getLatestSummary(userId);          // { vibe, profile, trends, createdAt } | null
```
