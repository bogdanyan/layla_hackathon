import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

// Next.js rewrites 127.0.0.1 to "localhost" in request.url, but Spotify only accepts
// http://127.0.0.1 redirect URIs (not localhost). Rebuild the URL from the Host header
// so Auth.js generates the same callback URL the browser actually used.
// (When AUTH_URL is set, e.g. for an ngrok/Vercel host, Auth.js uses that instead.)
async function withRealHost(req: NextRequest): Promise<NextRequest> {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (process.env.AUTH_URL || !host) return req;
  const url = new URL(req.url);
  url.host = host;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  return new Request(url, { method: req.method, headers: req.headers, body }) as NextRequest;
}

export async function GET(req: NextRequest) {
  return handlers.GET(await withRealHost(req));
}

export async function POST(req: NextRequest) {
  return handlers.POST(await withRealHost(req));
}
