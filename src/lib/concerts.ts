import { cacheLife } from "next/cache";
import { haversineKm } from "@/lib/location";
import type { SpotifyImage } from "@/lib/spotify";

// Upcoming concerts for a user's top artists, from SeatGeek (SEATGEEK_CLIENT_ID) or, if only that
// key is set, the Ticketmaster Discovery API (TICKETMASTER_API_KEY).
// Never ask the LLM for concerts. See docs/agents/concerts.md

export type Concert = {
  id: string;
  artist: string;
  artistImages?: SpotifyImage[];
  name: string;
  date: string; // YYYY-MM-DD, venue local
  time?: string; // HH:MM:SS, venue local
  venue?: string;
  city?: string;
  country?: string;
  url: string;
  distanceKm?: number;
};

export type Near = { lat: number; lng: number };
export type ConcertScope = "nearby" | "region" | "anywhere";
type Found = Omit<Concert, "artistImages" | "distanceKm"> & {
  lat?: number;
  lng?: number;
  /** The provider knows several performers with this name (e.g. SeatGeek slug "luna-1"): could be someone else. */
  ambiguous?: boolean;
};

const NEARBY_KM = 100;
const REGION_KM = 1500;
const MAX_ARTISTS = 15;
const BATCH = 5; // parallel provider calls (rate limits: SeatGeek undocumented, Ticketmaster 5 req/s)
const PER_ARTIST = 2;
const MAX_TOTAL = 6;

export const concertsEnabled = () => Boolean(process.env.SEATGEEK_CLIENT_ID || process.env.TICKETMASTER_API_KEY);

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/**
 * One provider search for an artist's upcoming shows, worldwide (distance is filtered afterwards, so
 * the cache is shared by all users). Cached for hours. Throws on HTTP errors so failures are not cached.
 */
async function searchArtistEvents(artist: string): Promise<Found[]> {
  "use cache";
  cacheLife("hours");
  return process.env.SEATGEEK_CLIENT_ID ? searchSeatGeek(artist) : searchTicketmaster(artist);
}

// ---------- SeatGeek (https://platform.seatgeek.com) ----------

type SGEvent = {
  id: number;
  title: string;
  url: string;
  datetime_local: string; // "2026-03-01T19:30:00"
  time_tbd?: boolean;
  venue?: { name?: string; city?: string; country?: string; location?: { lat?: number; lon?: number } };
  performers?: { name?: string; slug?: string }[];
};

async function searchSeatGeek(artist: string): Promise<Found[]> {
  const params = new URLSearchParams({
    client_id: process.env.SEATGEEK_CLIENT_ID!,
    q: artist,
    "taxonomies.name": "concert",
    sort: "datetime_local.asc",
    per_page: "50",
  });
  if (process.env.SEATGEEK_CLIENT_SECRET) params.set("client_secret", process.env.SEATGEEK_CLIENT_SECRET);

  const res = await fetch(`https://api.seatgeek.com/2/events?${params}`);
  if (!res.ok) throw new Error(`SeatGeek ${res.status}`);
  const json = (await res.json()) as { events?: SGEvent[] };

  // `q` is fuzzy: keep only events where this artist is actually a listed performer.
  const want = norm(artist);
  return (json.events ?? []).flatMap((e) => {
    const p = e.performers?.find((p) => p.name && norm(p.name) === want);
    if (!p || !e.datetime_local) return [];
    return [
      {
        id: `sg-${e.id}`,
        artist,
        name: e.title,
        date: e.datetime_local.slice(0, 10),
        time: e.time_tbd ? undefined : e.datetime_local.slice(11),
        venue: e.venue?.name,
        city: e.venue?.city,
        country: e.venue?.country,
        url: e.url,
        lat: e.venue?.location?.lat,
        lng: e.venue?.location?.lon,
        ambiguous: /-\d+$/.test(p.slug ?? ""),
      },
    ];
  });
}

// ---------- Ticketmaster (https://developer.ticketmaster.com) ----------

type TMEvent = {
  id: string;
  name: string;
  url: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  _embedded?: {
    venues?: {
      name?: string;
      city?: { name?: string };
      country?: { countryCode?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
    attractions?: { name?: string }[];
  };
};

async function searchTicketmaster(artist: string): Promise<Found[]> {
  const params = new URLSearchParams({
    apikey: process.env.TICKETMASTER_API_KEY!,
    keyword: artist,
    classificationName: "music",
    sort: "date,asc",
    size: "50",
  });

  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
  const json = (await res.json()) as { _embedded?: { events?: TMEvent[] } };

  // The keyword search is fuzzy: keep only events where this artist is actually a listed attraction.
  const want = norm(artist);
  return (json._embedded?.events ?? [])
    .filter((e) => e.dates?.start?.localDate && e._embedded?.attractions?.some((a) => a.name && norm(a.name) === want))
    .map((e) => {
      const v = e._embedded?.venues?.[0];
      return {
        id: `tm-${e.id}`,
        artist,
        name: e.name,
        date: e.dates!.start!.localDate!,
        time: e.dates?.start?.localTime,
        venue: v?.name,
        city: v?.city?.name,
        country: v?.country?.countryCode,
        url: e.url,
        lat: v?.location?.latitude ? Number(v.location.latitude) : undefined,
        lng: v?.location?.longitude ? Number(v.location.longitude) : undefined,
      };
    });
}

// ---------- merge ----------

type Artist = { name: string; images?: SpotifyImage[] };
type Hit = Found & { artistImages?: SpotifyImage[]; distanceKm?: number };

/** All upcoming shows for the artists, BATCH provider calls at a time. Failed artists are skipped. */
async function fetchAll(artists: Artist[]): Promise<Hit[]> {
  const all: Hit[] = [];
  const list = artists.slice(0, MAX_ARTISTS);
  for (let i = 0; i < list.length; i += BATCH) {
    const results = await Promise.all(
      list.slice(i, i + BATCH).map((a) =>
        searchArtistEvents(a.name)
          .then((events) => events.map((e): Hit => ({ ...e, artistImages: a.images })))
          .catch((err): Hit[] => (console.error("concerts:", a.name, err), [])),
      ),
    );
    all.push(...results.flat());
  }
  return all;
}

/** Sorted by date, deduped, at most PER_ARTIST per artist and MAX_TOTAL overall. */
function pick(events: Hit[]): Concert[] {
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  return events
    .sort((x, y) => (x.date + (x.time ?? "")).localeCompare(y.date + (y.time ?? "")))
    .filter((c) => {
      const n = perArtist.get(c.artist) ?? 0;
      if (seen.has(c.id) || n >= PER_ARTIST) return false;
      seen.add(c.id);
      perArtist.set(c.artist, n + 1);
      return true;
    })
    .slice(0, MAX_TOTAL)
    .map((c) => ({
      id: c.id,
      artist: c.artist,
      artistImages: c.artistImages,
      name: c.name,
      date: c.date,
      time: c.time,
      venue: c.venue,
      city: c.city,
      country: c.country,
      url: c.url,
      distanceKm: c.distanceKm,
    }));
}

/**
 * Upcoming shows for the user's favourite artists (pass them most-loved first).
 * With a location: within NEARBY_KM, else within REGION_KM ("region"), else anywhere.
 * Without a location: anywhere. Ambiguous names (another artist with the same
 * name may be playing) are only shown when nearby.
 */
export async function getConcerts(
  artists: Artist[],
  near?: Near | null,
): Promise<{ concerts: Concert[]; scope: ConcertScope }> {
  if (!concertsEnabled() || !artists.length) return { concerts: [], scope: near ? "nearby" : "anywhere" };
  const all = await fetchAll(artists);

  const anywhere = () => ({ concerts: pick(all.filter((c) => !c.ambiguous)), scope: "anywhere" as const });
  if (!near) return anywhere();

  const withDist = all
    .filter((c) => c.lat !== undefined && c.lng !== undefined)
    .map((c) => ({ ...c, distanceKm: Math.round(haversineKm(near.lat, near.lng, c.lat!, c.lng!)) }));
  const nearby = withDist.filter((c) => c.distanceKm <= NEARBY_KM);
  if (nearby.length) return { concerts: pick(nearby), scope: "nearby" };
  const region = withDist.filter((c) => c.distanceKm <= REGION_KM && !c.ambiguous);
  return region.length ? { concerts: pick(region), scope: "region" } : anywhere();
}
