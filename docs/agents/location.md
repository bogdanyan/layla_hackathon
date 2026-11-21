# Approximate location sharing

This lets users share a rough location so the Listening screen can show people nearby. Locations are **approximate by design**:
- Coordinates are snapped to a 0.01° grid (about 1.1 km). This happens on the client and again on the server, so raw coordinates never reach the DB.
- Other users only see a distance bucket (`< 1 km`, `~2 km`, `~5 km`, `~10 km`, `~25 km`), never coordinates.
- Locations older than 24h don't count as "nearby".

## Storage
There are three nullable columns on `users` (`src/db/schema.ts`): `lat`, `lng`, and `locationUpdatedAt`. `null` means the user isn't sharing. Run `npm run db:push` after pulling.

## Code
- `src/lib/location.ts` (server only):
  - `setLocation(userId, lat, lng)` rounds before saving.
  - `clearLocation(userId)`.
  - `RADII_KM` (1/5/10/25) and `DEFAULT_RADIUS_KM` (5): the radius options on the Listening screen.
  - `isSharingLocation(userId)`: true if the user shared a location in the last 24h.
  - `getNearbyUsers(userId, radiusKm = 10)` returns `{ userId, displayName, imageUrl, distanceLabel, nowPlaying, nowPlayingAt }[]`, closest first. It uses a bounding-box query plus Haversine in JS.
- `src/app/location-actions.ts`: server actions `updateMyLocation(lat, lng)` and `stopSharingLocation()`. Both use `auth()`.
- `src/components/share-location.tsx`: the `<ShareLocation />` client component. It requests the location through the browser Geolocation API (low accuracy) only on a button tap. If permission was already granted, it refreshes silently on mount. It has a "Stop" control, and after each change it calls `router.refresh()`.

## Usage (Listening screen)
The Listening screen is built: see [listening.md](listening.md). The minimal pattern is:
```tsx
import { ShareLocation } from "@/components/share-location";
import { getNearbyUsers } from "@/lib/location";

// inside a server component wrapped in <Suspense> + `await connection()` (see auth-and-db.md)
const session = await auth();
const nearby = await getNearbyUsers(session!.user.id);
// render <ShareLocation /> and the `nearby` list, then add each user's now-playing / recent tracks
```

## Gotcha: HTTPS required
Geolocation only works in a secure context. `http://127.0.0.1:3000` works on a laptop; use DevTools → Sensors to fake locations. A phone on `http://<LAN-IP>` will **not** get a location. For phone testing, use a deploy or an HTTPS tunnel (`cloudflared`/`ngrok`), and set `AUTH_URL` and the Spotify callback for that host.
