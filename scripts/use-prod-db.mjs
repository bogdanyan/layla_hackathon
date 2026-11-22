// Preload for the *:prod npm scripts: point DATABASE_URL at DATABASE_URL_PROD (Supabase) from .env.local.
if (!process.env.DATABASE_URL_PROD) {
  console.error("DATABASE_URL_PROD is empty: add the Supabase transaction pooler URL to .env.local.");
  process.exit(1);
}
process.env.DATABASE_URL = process.env.DATABASE_URL_PROD;
console.log("Using production database (DATABASE_URL_PROD)");
