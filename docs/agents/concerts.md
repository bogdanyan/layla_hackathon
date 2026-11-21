# Concerts (SeatGeek / Ticketmaster)

The Concerts section of the Summary page lists upcoming shows by the user's top artists. Spotify's Web API has no events endpoint, so the data comes from **SeatGeek** (preferred) or the **Ticketmaster Discovery API** (fallback). Never ask the LLM for concerts.

## Setup (`.env.local`)
- `SEATGEEK_CLIENT_ID` (+ optional `SEATGEEK_CLIENT_SECRET`): seatgeek.com/account/develop. If set, SeatGeek is used.
- `TICKETMASTER_API_KEY`: developer.ticketmaster.com → Consumer Key. Used only when there's no SeatGeek ID.
- With neither, `concertsEnabled()` is false and the page shows a "coming soon" placeholder.

## Code: `src/lib/concerts.ts`
- `getConcerts(artists, near?)` returns `{ concerts: Concert[], scope: "nearby" | "region" | "anywhere" }`.
  - `artists`: favourites, most-loved first. The page passes the 4-week, then 6-month, then 1-year top artists, deduped. The first 15 are searched, 5 at a time in parallel.
  - At most 2 shows per artist and 6 in total, sorted by date.
  - With `near` (`users.lat/lng`, ~1 km rounded), distance to each venue is computed: shows within 100 km → `nearby`. If none, shows within 1500 km → `region` ("Worth the trip"). Otherwise it falls back to shows anywhere (`anywhere`).
  - Without `near`: shows anywhere (`anywhere`).
- `searchArtistEvents(artist)` makes one worldwide provider call (`searchSeatGeek` or `searchTicketmaster`), cached with `"use cache"` + `cacheLife("hours")` per artist, so the cache is shared by all users. Errors throw, so they're not cached, and that artist is skipped. The cache is in memory.
- **Matching:** text search is fuzzy, so we keep only events where a performer/attraction name equals the artist name (lowercased, accents and punctuation removed, `&` → `and`).
- **Same-name artists:** SeatGeek adds a number to the slug when several performers share a name (`luna-1`). Those shows are marked `ambiguous` and only shown when nearby. Ticketmaster has no such signal.
- **Coverage:** SeatGeek only lists US/Canada shows, so European users will usually see far-away "Upcoming anywhere" shows until a Ticketmaster key is set.
- To add a provider: write `searchX(artist): Promise<Found[]>` (with venue `lat/lng`) and choose it in `searchArtistEvents`.

## UI (`src/app/summary.tsx`)
`<Concerts facts near />` renders inside `<Suspense>` (`ConcertsSkeleton`) with `Row` items: artist image, venue · city, date, linking to the ticket page. Without a location it shows `<ShareLocation />` underneath.
