# Deploy (Vercel + Supabase)

Vercel builds and deploys whatever is pushed to `main` on GitHub. If the site shows Vercel's `404 NOT_FOUND` page, the pushed code is missing or the build failed. Check the deployment in the Vercel dashboard.

## One-time setup
1. **Env vars** in Vercel → Settings → Environment Variables, using the same names as `.env.example`:
   - `DATABASE_URL`: the Supabase transaction pooler URL (port 6543). A `127.0.0.1` URL can't be reached from Vercel.
   - `AUTH_SECRET`, `AUTH_SPOTIFY_ID`, `AUTH_SPOTIFY_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, and the concert keys if you use them.
   - `AUTH_URL=https://<your-app>.vercel.app` (optional on Vercel, but explicit is safer).
2. **Spotify dashboard:** add the redirect URI `https://<your-app>.vercel.app/api/auth/callback/spotify`. In development mode, also add each tester's Spotify account under User Management.
3. **Schema and demo data** on Supabase: put the Supabase URL in `.env.local` as `DATABASE_URL_PROD`, then run `npm run db:push:prod`, and `npm run db:seed-demo:prod` if you want demo users (pass `-- <lat> <lng>` if nobody in prod has shared a location yet). **Run `db:push:prod` after every schema change** that gets pushed to `main`; Vercel does not migrate the DB.

## Code bits that exist for Vercel
- `vercel.json`: `"framework": "nextjs"` (the project was created when the repo had no app, so Vercel guessed "Other" and looked for `public/`), plus a daily cron calls `/api/cron/sync`. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. The Hobby plan only allows daily crons; pages also sync on visit through `ensureFresh`.
- `next.config.ts`: `outputFileTracingIncludes` bundles `assets/fonts` for `/api/story`.
- `src/db/index.ts`: the connection pool is reused across warm invocations and limited to 3 connections on Vercel.
- `src/app/api/auth/[...nextauth]/route.ts`: when `AUTH_URL` is set, Auth.js uses it. Otherwise it rebuilds the callback URL from the Host header.
