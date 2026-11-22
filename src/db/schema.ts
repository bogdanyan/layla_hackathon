import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  spotifyId: text("spotify_id").notNull().unique(),
  displayName: text("display_name"),
  email: text("email"),
  imageUrl: text("image_url"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  // Approximate location (rounded to ~1 km grid). null = not sharing. See docs/agents/location.md
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  locationUpdatedAt: timestamp("location_updated_at", { withTimezone: true }),
  // IANA timezone from the browser (e.g. "Europe/Berlin"), for local-time stats. null = UTC.
  timezone: text("timezone"),
  // Spotify sync state. See docs/agents/sync.md
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncErrors: jsonb("sync_errors").$type<Record<string, { status?: number; message: string; needsReauth?: boolean }>>(),
  nowPlaying: jsonb("now_playing").$type<NowPlaying | null>(),
  nowPlayingAt: timestamp("now_playing_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;

/** What's playing right now (null in users.nowPlaying = nothing playing). */
export type NowPlaying = {
  isPlaying: boolean;
  progressMs: number | null;
  track: StoredTrack;
};

/** Trimmed Spotify track, the shape stored in DB JSON. A full SpotifyTrack is assignable to it. */
export type StoredTrack = {
  id: string;
  name: string;
  explicit: boolean;
  duration_ms: number;
  artists: { id: string; name: string }[];
  album: { name: string; images: { url: string; width: number | null; height: number | null }[] };
  external_urls: { spotify: string };
};

/** Listening history: one row per play, deduped on (userId, playedAt). Spotify only exposes the last 50. */
export const plays = pgTable(
  "plays",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
    trackId: text("track_id").notNull(),
    trackName: text("track_name").notNull(),
    artistIds: text("artist_ids").array().notNull(),
    artistNames: text("artist_names").array().notNull(),
    albumName: text("album_name"),
    imageUrl: text("image_url"),
    durationMs: integer("duration_ms"),
    explicit: boolean("explicit").notNull().default(false),
  },
  (t) => [unique().on(t.userId, t.playedAt), index().on(t.userId, t.playedAt.desc())],
);

/**
 * Timestamped copies of Spotify data (top lists, playlists, profile...). A new row is only
 * inserted when the content hash changes, so the latest row per (userId, kind) is the current state.
 */
export const spotifySnapshots = pgTable(
  "spotify_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull(),
    hash: text("hash").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.kind, t.fetchedAt.desc())],
);

/** Generated "vibe" summaries. Latest row per user is the current vibe; regenerated only when input changes. */
export const vibes = pgTable(
  "vibes",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inputHash: text("input_hash").notNull(),
    model: text("model").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt.desc())],
);

/**
 * One chat per pair of users (either direction). Messaging is only allowed once `status` is
 * "accepted". `note` is the optional intro sent with the request. See docs/agents/chat.md
 */
export const chats = pgTable(
  "chats",
  {
    id: serial("id").primaryKey(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<ChatStatus>().notNull().default("pending"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.requesterId, t.recipientId), index().on(t.recipientId)],
);

export type ChatStatus = "pending" | "accepted" | "declined";
export type Chat = typeof chats.$inferSelect;

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.chatId, t.createdAt)],
);

export type Message = typeof messages.$inferSelect;
