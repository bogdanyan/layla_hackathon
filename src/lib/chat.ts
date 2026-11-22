// Server-only. Request-gated 1:1 chat. See docs/agents/chat.md
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { chats, db, messages, users, type Chat, type Message } from "@/db";
import { DEMO_PREFIX } from "./nearby";

export const MAX_NOTE = 200;
export const MAX_MESSAGE = 1000;

export type ChatUser = { id: string; displayName: string | null; imageUrl: string | null; isDemo: boolean };

/** Demo users (scripts/seed-demo.ts) accept every request and answer with one of these. */
const DEMO_GREETINGS = [
  "Hey! Saw we have a similar taste 🎧",
  "Hi! What are you listening to right now?",
  "Oh hey, nice to meet another music nerd nearby!",
];
const DEMO_REPLIES = [
  "Haha totally agree",
  "Have you heard their new album? It's on repeat for me",
  "We should check out a concert together sometime 🎶",
  "That track is a banger",
  "Send me your favourite song right now",
  "Honestly my whole week has been that vibe",
  "Ooh, adding that to my playlist",
];
const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)];

async function getUser(id: string): Promise<ChatUser | null> {
  const [u] = await db
    .select({ id: users.id, displayName: users.displayName, imageUrl: users.imageUrl, spotifyId: users.spotifyId })
    .from(users)
    .where(eq(users.id, id));
  return u ? { id: u.id, displayName: u.displayName, imageUrl: u.imageUrl, isDemo: u.spotifyId.startsWith(DEMO_PREFIX) } : null;
}

const pairWhere = (a: string, b: string) =>
  or(
    and(eq(chats.requesterId, a), eq(chats.recipientId, b)),
    and(eq(chats.requesterId, b), eq(chats.recipientId, a)),
  );

export async function findChat(me: string, other: string): Promise<Chat | null> {
  const [c] = await db.select().from(chats).where(pairWhere(me, other));
  return c ?? null;
}

const otherId = (c: Chat, me: string) => (c.requesterId === me ? c.recipientId : c.requesterId);

/** Everything the thread page needs for (me, other). `chat` is null if nobody has reached out yet. */
export async function getChatState(me: string, other: string) {
  const [user, chat] = await Promise.all([getUser(other), findChat(me, other)]);
  if (!user) return null;
  const msgs =
    chat?.status === "accepted"
      ? await db.select().from(messages).where(eq(messages.chatId, chat.id)).orderBy(asc(messages.createdAt), asc(messages.id))
      : [];
  return { user, chat, role: chat ? (chat.requesterId === me ? "requester" : "recipient") : null, messages: msgs } as const;
}

export type ChatListItem = { chat: Chat; user: ChatUser; last: Message | null };

/** Chat tab: incoming requests, active chats (latest first) and sent requests. */
export async function listChats(me: string) {
  const rows = await db
    .select()
    .from(chats)
    .where(and(or(eq(chats.requesterId, me), eq(chats.recipientId, me)), inArray(chats.status, ["pending", "accepted"])));
  if (!rows.length) return { incoming: [], active: [], outgoing: [] };

  const ids = [...new Set(rows.map((c) => otherId(c, me)))];
  const chatIds = rows.map((c) => c.id);
  const [people, lasts] = await Promise.all([
    db
      .select({ id: users.id, displayName: users.displayName, imageUrl: users.imageUrl, spotifyId: users.spotifyId })
      .from(users)
      .where(inArray(users.id, ids)),
    db
      .selectDistinctOn([messages.chatId])
      .from(messages)
      .where(inArray(messages.chatId, chatIds))
      .orderBy(messages.chatId, desc(messages.createdAt), desc(messages.id)),
  ]);
  const byId = new Map(
    people.map((u) => [u.id, { id: u.id, displayName: u.displayName, imageUrl: u.imageUrl, isDemo: u.spotifyId.startsWith(DEMO_PREFIX) }]),
  );
  const lastBy = new Map(lasts.map((m) => [m.chatId, m]));
  const items: ChatListItem[] = rows.flatMap((chat) => {
    const user = byId.get(otherId(chat, me));
    return user ? [{ chat, user, last: lastBy.get(chat.id) ?? null }] : [];
  });
  const activity = (i: ChatListItem) => (i.last?.createdAt ?? i.chat.updatedAt).getTime();

  return {
    incoming: items.filter((i) => i.chat.status === "pending" && i.chat.recipientId === me),
    active: items.filter((i) => i.chat.status === "accepted").sort((a, b) => activity(b) - activity(a)),
    outgoing: items.filter((i) => i.chat.status === "pending" && i.chat.requesterId === me),
  };
}

/** Accepted: copy the intro note in as the first message, and let a demo user say hi back. */
async function onAccepted(chat: Chat, recipient: ChatUser) {
  if (chat.note) {
    await db.insert(messages).values({ chatId: chat.id, senderId: chat.requesterId, body: chat.note, createdAt: chat.createdAt });
  }
  if (recipient.isDemo) await db.insert(messages).values({ chatId: chat.id, senderId: recipient.id, body: pick(DEMO_GREETINGS) });
}

export async function requestChat(me: string, other: string, note?: string) {
  if (me === other) throw new Error("You can't chat with yourself");
  const recipient = await getUser(other);
  if (!recipient) throw new Error("User not found");
  const cleanNote = note?.trim().slice(0, MAX_NOTE) || null;

  const existing = await findChat(me, other);
  if (existing) {
    // They already asked me: sending a request back means yes.
    if (existing.status === "pending" && existing.recipientId === me) return respond(me, existing.id, true);
    return existing; // already pending/accepted/declined: nothing to do
  }

  const [chat] = await db
    .insert(chats)
    .values({ requesterId: me, recipientId: other, note: cleanNote, status: recipient.isDemo ? "accepted" : "pending" })
    .onConflictDoNothing()
    .returning();
  if (chat?.status === "accepted") await onAccepted(chat, recipient);
  return chat ?? (await findChat(me, other));
}

export async function respond(me: string, chatId: number, accept: boolean) {
  const [chat] = await db
    .update(chats)
    .set({ status: accept ? "accepted" : "declined" })
    .where(and(eq(chats.id, chatId), eq(chats.recipientId, me), eq(chats.status, "pending")))
    .returning();
  if (!chat) throw new Error("Request not found");
  if (accept) {
    const recipient = await getUser(me);
    if (recipient) await onAccepted(chat, { ...recipient, isDemo: false });
  }
  return chat;
}

export async function sendMessage(me: string, chatId: number, body: string) {
  const text = body.trim();
  if (!text || text.length > MAX_MESSAGE) throw new Error("Message must be 1–1000 characters");
  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.status, "accepted"), or(eq(chats.requesterId, me), eq(chats.recipientId, me))));
  if (!chat) throw new Error("Chat not found or not accepted");

  await db.insert(messages).values({ chatId, senderId: me, body: text });
  await db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));

  const other = await getUser(otherId(chat, me));
  if (other?.isDemo) {
    // +1s so the reply always sorts after the message it answers.
    await db.insert(messages).values({ chatId, senderId: other.id, body: pick(DEMO_REPLIES), createdAt: new Date(Date.now() + 1000) });
  }
}
