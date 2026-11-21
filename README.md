# layla_hackathon

Mobile-first Next.js web app (see `claude.md` for the product overview).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in secrets (see below)
docker compose up -d         # local Postgres on port 5433
npm run db:push              # create/update tables in Supabase
npm run dev                  # open http://127.0.0.1:3000 (not localhost — Spotify requires 127.0.0.1)
```

### One-time setup
- **Database**: local Postgres via `docker compose up -d` (default `DATABASE_URL` in `.env.example`). For a shared/hosted DB later: Supabase → *Connect* → **Transaction pooler** URI (port 6543).
- **Spotify**: create an app at https://developer.spotify.com/dashboard, add redirect URI
  `http://127.0.0.1:3000/api/auth/callback/spotify`, copy client id/secret into `AUTH_SPOTIFY_ID` / `AUTH_SPOTIFY_SECRET`.
  In development mode, add every teammate's Spotify email under **User Management**.
- **Auth secret**: `npx auth secret` (writes `AUTH_SECRET` to `.env.local`).

### Testing on a phone
Spotify only allows HTTPS redirect URIs (except 127.0.0.1), so use a deploy (Vercel) or a tunnel (`ngrok http 3000`).
Register `https://<host>/api/auth/callback/spotify` in the Spotify dashboard and set `AUTH_URL=https://<host>`.

## Stack
- Next.js (App Router, TypeScript, `src/` dir) + Tailwind CSS v4
- Auth.js (next-auth v5) with Spotify provider, JWT sessions — `src/auth.ts`
- Supabase Postgres via Drizzle ORM — `src/db/`
- Spotify API helper with token refresh — `src/lib/spotify.ts` (`spotifyFetch(userId, "/me/...")`)
