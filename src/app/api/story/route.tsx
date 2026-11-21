/* eslint-disable @next/next/no-img-element -- next/og renders plain <img> */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { albumArt, CARD_LABEL, cardGradient, CARDS, type CardKind } from "@/lib/cards";
import { getSummaryFacts, type SummaryFacts } from "@/lib/summary";
import { getLatestSummary, type Summary } from "@/lib/vibe";

// next/og only supports flexbox: every element with several children needs display: flex.
const [regular, bold] = await Promise.all([
  readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Geist-Bold.ttf")),
]);

/** 1080x1920 story PNG for one Summary card: GET /api/story?card=vibe|week|listener|trends */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const param = new URL(req.url).searchParams.get("card") ?? "vibe";
  const card = (CARDS as readonly string[]).includes(param) ? (param as CardKind) : null;
  if (!card) return new Response("Unknown card", { status: 400 });

  const [summary, facts] = await Promise.all([
    getLatestSummary(session.user.id),
    getSummaryFacts(session.user.id),
  ]);
  if (!summary && card !== "week") return new Response("No summary yet", { status: 404 });

  const body =
    card === "vibe" ? (
      <VibeStory s={summary!} f={facts} />
    ) : card === "week" ? (
      <WeekStory f={facts} />
    ) : card === "listener" ? (
      <ListenerStory s={summary!} />
    ) : (
      <TrendsStory s={summary!} />
    );

  return new ImageResponse(<Frame card={card} colors={summary?.vibe.colors}>{body}</Frame>, {
    width: 1080,
    height: 1920,
    fonts: [
      { name: "Geist", data: regular, weight: 400, style: "normal" },
      { name: "Geist", data: bold, weight: 700, style: "normal" },
    ],
  });
}

// ---------- layout ----------

function Frame({ card, colors, children }: { card: CardKind; colors?: string[]; children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "130px 90px 110px",
        color: "white",
        fontFamily: "Geist",
        backgroundImage: cardGradient(colors, card),
      }}
    >
      <div style={{ display: "flex", fontSize: 38, letterSpacing: 8, opacity: 0.85 }}>
        {CARD_LABEL[card].toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", margin: "48px 0" }}>
        {children}
      </div>
      <div style={{ display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: 2 }}>layla</div>
    </div>
  );
}

const Col = ({ children, gap = 44 }: { children: ReactNode; gap?: number }) => (
  <div style={{ display: "flex", flexDirection: "column", gap }}>{children}</div>
);

const Label = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", fontSize: 32, letterSpacing: 6, opacity: 0.75, marginTop: 20 }}>{children}</div>
);

function TrackLine({
  name,
  artist,
  imageUrl,
  right,
  size = 140,
}: {
  name: string;
  artist: string;
  imageUrl: string | null;
  right?: string;
  size?: number;
}) {
  const src = albumArt(imageUrl);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
      {src ? (
        <img src={src} alt="" width={size} height={size} style={{ borderRadius: 18 }} />
      ) : (
        <div style={{ display: "flex", width: size, height: size, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.25)" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, width: 0 }}>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 700 }}>{name}</div>
        <div style={{ display: "flex", fontSize: 36, opacity: 0.8 }}>{artist}</div>
      </div>
      {right && <div style={{ display: "flex", fontSize: 34, opacity: 0.8 }}>{right}</div>}
    </div>
  );
}

const Box = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 10,
      padding: "30px 36px",
      borderRadius: 32,
      backgroundColor: "rgba(0,0,0,0.22)",
    }}
  >
    {children}
  </div>
);

// ---------- cards ----------

function VibeStory({ s, f }: { s: Summary; f: SummaryFacts }) {
  return (
    <Col gap={32}>
      <div
        style={{
          display: "flex",
          width: 200,
          height: 200,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          fontSize: 120,
          backgroundColor: "rgba(255,255,255,0.85)",
        }}
      >
        {s.vibe.emoji}
      </div>
      <div style={{ display: "flex", fontSize: 96, fontWeight: 700, lineHeight: 1.05 }}>{s.vibe.title}</div>
      <div style={{ display: "flex", fontSize: 46, lineHeight: 1.3, opacity: 0.95 }}>{s.vibe.tagline}</div>
      <div style={{ display: "flex", fontSize: 38, lineHeight: 1.35, opacity: 0.8 }}>{s.vibe.description}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        {s.vibe.moods.map((m) => (
          <div
            key={m}
            style={{ display: "flex", fontSize: 36, padding: "12px 30px", borderRadius: 999, backgroundColor: "rgba(0,0,0,0.25)" }}
          >
            {m}
          </div>
        ))}
      </div>
      {f.intoRightNow.length > 0 && <Label>INTO RIGHT NOW</Label>}
      {f.intoRightNow.map((t) => (
        <TrackLine key={t.id} name={t.name} artist={t.artist} imageUrl={t.imageUrl} size={116} />
      ))}
    </Col>
  );
}

function WeekStory({ f }: { f: SummaryFacts }) {
  const w = f.thisWeek;
  return (
    <Col>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
        <div style={{ display: "flex", fontSize: 240, fontWeight: 700, lineHeight: 1 }}>{w.minutes}</div>
        <div style={{ display: "flex", fontSize: 50, opacity: 0.85 }}>minutes</div>
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        {[
          { label: "PLAYS", value: String(w.plays) },
          { label: "PEAK TIME", value: w.peak ? w.peak.band : "—" },
        ].map((x) => (
          <div key={x.label} style={{ display: "flex", flexDirection: "column", flexGrow: 1, gap: 6, padding: "28px 34px", borderRadius: 32, backgroundColor: "rgba(0,0,0,0.22)" }}>
            <div style={{ display: "flex", fontSize: 30, letterSpacing: 4, opacity: 0.75 }}>{x.label}</div>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>{x.value}</div>
          </div>
        ))}
      </div>
      {w.topArtists[0] && (
        <Col>
          <Label>TOP ARTIST</Label>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 700, lineHeight: 1.05 }}>{w.topArtists[0].name}</div>
        </Col>
      )}
      {w.topTracks.length > 0 && <Label>ON REPEAT</Label>}
      {w.topTracks.slice(0, 3).map((t) => (
        <TrackLine key={t.trackId} name={t.name} artist={t.artist} imageUrl={t.imageUrl} right={`${t.plays}×`} />
      ))}
    </Col>
  );
}

function ListenerStory({ s }: { s: Summary }) {
  return (
    <Col>
      <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>{s.profile.headline}</div>
      <div style={{ display: "flex", fontSize: 42, lineHeight: 1.35, opacity: 0.92 }}>{s.profile.description}</div>
      {s.profile.traits.map((t) => (
        <Box key={t.label}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>{t.label}</div>
          <div style={{ display: "flex", fontSize: 34, lineHeight: 1.3, opacity: 0.85 }}>{t.explanation}</div>
        </Box>
      ))}
    </Col>
  );
}

function TrendsStory({ s }: { s: Summary }) {
  return (
    <Col>
      {s.trends.map((t) => (
        <Box key={t.title}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ display: "flex", fontSize: 64 }}>{t.emoji}</div>
            <div style={{ display: "flex", fontSize: 50, fontWeight: 700, flexGrow: 1, width: 0 }}>{t.title}</div>
          </div>
          <div style={{ display: "flex", fontSize: 38, lineHeight: 1.3, opacity: 0.88 }}>{t.detail}</div>
        </Box>
      ))}
    </Col>
  );
}
