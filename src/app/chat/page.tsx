import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { BottomNav } from "@/components/bottom-nav";
import { Avatar, chatName as name } from "@/components/chat-avatar";
import { RespondButtons } from "@/components/chat-forms";
import { Skeleton } from "@/components/skeleton";
import { Empty } from "@/components/track-row";
import { listChats, type ChatListItem } from "@/lib/chat";
import { timeAgo } from "@/lib/format";

/** Chat tab: incoming requests, conversations, and sent requests. */
export default function ChatPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-24">
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
      <BottomNav />
    </main>
  );
}

async function Content() {
  await connection(); // auth() must run at request time (see page.tsx)
  const session = await auth();
  if (!session?.user) redirect("/");
  const me = session.user.id;
  const { incoming, active, outgoing } = await listChats(me);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh ms={10_000} />
      <AppHeader name={session.user.name} image={session.user.image} />
      <h1 className="text-2xl font-semibold">Chats</h1>

      {incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Requests</h2>
          <ul className="flex flex-col gap-3">
            {incoming.map(({ chat, user }) => (
              <li key={chat.id} className="flex flex-col gap-2 rounded-xl bg-current/5 p-3">
                <Link href={`/chat/${user.id}`} className="flex items-center gap-2">
                  <Avatar user={user} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name(user)}</span>
                  <span className="text-xs opacity-50">{timeAgo(chat.createdAt)}</span>
                </Link>
                {chat.note && <p className="text-sm opacity-80">“{chat.note}”</p>}
                <RespondButtons chatId={chat.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Messages</h2>
        {active.length === 0 ? (
          <Empty>No chats yet. Say hi to someone on the Nearby tab.</Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {active.map((i) => (
              <ChatRow key={i.chat.id} item={i} me={me} />
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Sent requests</h2>
          <ul className="flex flex-col gap-1">
            {outgoing.map(({ chat, user }) => (
              <li key={chat.id}>
                <Link href={`/chat/${user.id}`} className="flex items-center gap-3 rounded-lg py-1.5">
                  <Avatar user={user} />
                  <span className="min-w-0 flex-1 truncate text-sm">{name(user)}</span>
                  <span className="text-xs opacity-50">waiting…</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ChatRow({ item: { chat, user, last }, me }: { item: ChatListItem; me: string }) {
  return (
    <li>
      <Link href={`/chat/${user.id}`} className="flex items-center gap-3 rounded-lg py-2 active:bg-current/5">
        <Avatar user={user} size="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name(user)}</p>
          <p className="truncate text-xs opacity-60">
            {last ? `${last.senderId === me ? "You: " : ""}${last.body}` : "Say hi 👋"}
          </p>
        </div>
        <span className="shrink-0 text-xs opacity-50">{timeAgo(last?.createdAt ?? chat.updatedAt)}</span>
      </Link>
    </li>
  );
}
