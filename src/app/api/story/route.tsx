import { ImageResponse } from "next/og";
import { auth } from "@/auth";
import { getSummaryFacts } from "@/lib/summary";
import { getLatestSummary } from "@/lib/vibe";

/** 1080x1920 "story" PNG of the current user's vibe, for <ShareStory />. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const [summary, facts] = await Promise.all([
    getLatestSummary(session.user.id),
    getSummaryFacts(session.user.id),
  ]);
  if (!summary) return new Response("No vibe yet", { status: 404 });

  const { vibe, profile } = summary;
  const artists = (facts.thisWeek.topArtists.length
    ? facts.thisWeek.topArtists.map((a) => a.name)
    : facts.topArtists4Weeks.map((a) => a.name)
  ).slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "140px 96px 120px",
          color: "white",
          backgroundImage: `linear-gradient(160deg, ${vibe.colors.join(", ")})`,
        }}
      >
        <div style={{ display: "flex", fontSize: 40, letterSpacing: 8, opacity: 0.85 }}>MY VIBE RIGHT NOW</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <div
            style={{
              display: "flex",
              width: 300,
              height: 300,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              fontSize: 180,
              backgroundColor: "rgba(255,255,255,0.85)",
            }}
          >
            {vibe.emoji}
          </div>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 800, lineHeight: 1.05 }}>{vibe.title}</div>
          <div style={{ display: "flex", fontSize: 50, lineHeight: 1.3, opacity: 0.92 }}>{vibe.tagline}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 10 }}>
            {vibe.moods.map((m) => (
              <div
                key={m}
                style={{
                  display: "flex",
                  fontSize: 38,
                  padding: "14px 32px",
                  borderRadius: 999,
                  backgroundColor: "rgba(0,0,0,0.25)",
                }}
              >
                {m}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 40, opacity: 0.8 }}>{profile.headline}</div>
          {artists.length > 0 && (
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>On repeat: {artists.join(" · ")}</div>
          )}
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, marginTop: 40, letterSpacing: 2 }}>
            layla
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 },
  );
}
