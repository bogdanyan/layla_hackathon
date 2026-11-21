import type { NextRequest } from "next/server";

// Spotify only accepts http://127.0.0.1 (not localhost) as a local redirect URI,
// so send anyone who opens http://localhost:3000 to http://127.0.0.1:3000.
// We can't use a normal 3xx redirect: Next treats localhost and 127.0.0.1 as the same
// host and rewrites the Location header back to a relative URL. A tiny HTML page works.
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host === "localhost" || host.startsWith("localhost:")) {
    const { pathname, search } = req.nextUrl;
    const target = JSON.stringify(`http://${host.replace("localhost", "127.0.0.1")}${pathname}${search}`).replace(/</g, "\\u003c");
    return new Response(`<!doctype html><script>location.replace(${target})</script>`, {
      headers: { "Content-Type": "text/html" },
    });
  }
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
