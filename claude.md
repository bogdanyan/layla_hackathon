# CLAUDE.md — Hackathon Project Overview

## Context & Goal

We are building a **mobile-first Next.js web application** as part of a hackathon. While the concept is a mobile app, for now it is a Next.js website designed specifically to be opened and used in a mobile phone browser.

Because we are limited in time, our top priority is building the **simplest possible working MVP**.

## Core Features & Screens

1. **Spotify Connection & User Profile**
   * Users connect their Spotify account to get started.

2. **Summary Page (MVP 1)**
   * Displays what the user listened to recently and their general listening trends.
   * Highlights the user's AI-generated **"vibe"**.
   * Includes a **Share** button to share the summary to a story.
   * Displays **concert recommendations**.

3. **Listening Screen (MVP 2)**
   * Shows people nearby and what they are listening to (either right now or recently).
   * **Stretch Goal:** Recommend people with similar music taste.

4. **Chat (MVP 2)**
   * Enables chatting with people you reached out to from the Listening screen.

## High-Level Data & System Flow

* **Spotify Sync & Storage:** Fetch listening data from Spotify and store it per user.
* **LLM Analysis:** Run LLM analysis on recent listening trends from time to time to generate insights and "vibe" summaries for the Summary page.
* **Taste Matching (Stretch Goal):** Suggesting people with similar tastes may require a graph database.

## Work Directions

Development is split across four main areas:
* **Import + storage** (fetching and persisting Spotify data per user)
* **LLM analysis** (generating trends/vibe summaries)
* **User profile** (Spotify login, user state, basic profile)
* **Chat** (messaging people discovered on the Listening screen)

## Hackathon Guidelines for Claude

* **Keep it simple:** Always choose the fastest, simplest working solution over complex architecture or abstractions.
* **Mobile browser first:** Build all layouts and interactions specifically for a phone screen viewport.
* **Ask before over-engineering:** Keep dependencies minimal and check before introducing heavy infrastructure.

## Project Infrastructure

* **Stack:** Next.js 16 (App Router, TypeScript, `src/`, `cacheComponents` on), Tailwind v4, Auth.js (Spotify), Postgres via Drizzle ORM (local Docker for now, see `docker-compose.yml`; Supabase later).
* **Next 16 differs from older versions.** Check `node_modules/next/dist/docs/` before using unfamiliar APIs (see `AGENTS.md`).
* **Layout:** `src/app/layout.tsx` sets a mobile viewport and a `max-w-md` phone-width column.
* **Run:** `cp .env.example .env.local`, then `docker compose up -d`, then `npm run db:push`, then `npm run dev`. Open **http://127.0.0.1:3000** (not localhost; Spotify requires it).

## Agent Docs

Per-area docs for agents live in `docs/agents/`. **When you build or change an area, add/update its doc** (short: what it is, where the code lives, how to use it) and link it here.

* [LLM wrapper](docs/agents/llm.md) — `src/lib/llm.ts`: `generateText` / `generateJSON` (zod-typed) around Claude. Use for all LLM calls.
* [Auth + DB](docs/agents/auth-and-db.md) — Spotify login (`src/auth.ts`), `users` table (`src/db/`), `spotifyFetch` with token refresh (`src/lib/spotify.ts`). Use `auth()` for the current user and `spotifyFetch` for all Spotify API calls.
* [Spotify sync + vibe](docs/agents/sync.md): Spotify data stored in Postgres (`plays` history, hashed `spotify_snapshots`, `users.nowPlaying`) via `src/lib/sync.ts`. The cached LLM vibe is in `src/lib/vibe.ts`. Pages read from the DB through `ensureFresh` and `getLatest*`; the cron route is `/api/cron/sync`.
* [Summary & vibe page](docs/agents/summary.md): `/` = Summary. Deterministic facts come from `src/lib/summary.ts` (numbers) and the LLM summary from `src/lib/vibe.ts` (words only; bump `PROMPT_VERSION` after prompt changes). Story PNG at `/api/story`; raw data at `/data`.
* [Location](docs/agents/location.md) — approximate (~1 km) location on `users` (`lat`/`lng`/`locationUpdatedAt`), `<ShareLocation />` button, `getNearbyUsers()` returning distance buckets only. Geolocation needs HTTPS on phones.
* [Concerts](docs/agents/concerts.md) — `src/lib/concerts.ts`: `getConcerts(topArtists, near?)` via SeatGeek (`SEATGEEK_CLIENT_ID`) or Ticketmaster fallback (`TICKETMASTER_API_KEY`), cached hourly; nearby (100 km), else within 1500 km, else anywhere.
* [Listening screen](docs/agents/listening.md): `/nearby` shows people within 1/5/10/25 km and what they're playing now or recently, via `getNearbyListening` (`src/lib/nearby.ts`). Includes the `<BottomNav />` tab bar and `<AutoRefresh />`.
* [Taste matching](docs/agents/taste.md): `getTasteMatches(userId)` in `src/lib/taste.ts` ranks everyone by shared artists (cosine over top-artist snapshots plus recent plays). Shown on `/nearby` as "Your taste twins" and match % pills.
* [Chat](docs/agents/chat.md): request-gated 1:1 chat. `chats` and `messages` tables, logic in `src/lib/chat.ts`, Chat tab `/chat`, threads `/chat/[userId]`. Demo users auto-accept and send canned replies. Updates by polling.
