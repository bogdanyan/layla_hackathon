import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { BottomNav } from "@/components/bottom-nav";
import { Avatar, chatName } from "@/components/chat-avatar";
import { Composer, RequestForm, RespondButtons, ScrollToBottom } from "@/components/chat-forms";
import { Skeleton } from "@/components/skeleton";
import { getChatState } from "@/lib/chat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 1:1 thread with another user. Shows the request flow until the chat is accepted. */
export default function ThreadPage({ params }: PageProps<"/chat/[userId]">) {
  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-40">
      <Suspense fallback={<Skeleton />}>
        <Thread params={params} />
      </Suspense>
      <BottomNav />
    </main>
  );
}

async function Thread({ params }: { params: PageProps<"/chat/[userId]">["params"] }) {
  await connection(); // auth() must run at request time (see page.tsx)
  const session = await auth();
  if (!session?.user) redirect("/");
  const me = session.user.id;
  const { userId } = await params;
  if (!UUID.test(userId)) notFound();
  if (userId === me) redirect("/chat");
  const state = await getChatState(me, userId);
  if (!state) notFound();
  const { user, chat, role, messages } = state;
  const name = chatName(user);

  return (
    <div className="flex flex-col gap-5">
      <header className="sticky top-0 z-10 -mx-5 -mt-6 flex items-center gap-3 bg-background/90 px-5 pt-6 pb-3 backdrop-blur">
        <Link href="/chat" className="-ml-1 px-1 text-2xl leading-none opacity-70" aria-label="Back">
          ‹
        </Link>
        <Avatar user={user} size="h-10 w-10" />
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{name}</p>
      </header>

      {!chat ? (
        <Card>
          <p className="text-sm">
            Say hi to <b>{name}</b>. You can chat once they accept your request.
          </p>
          <RequestForm otherId={user.id} name={name} />
        </Card>
      ) : chat.status === "declined" ? (
        <Card>
          <p className="text-sm opacity-70">{role === "requester" ? `${name} isn't taking chats right now.` : "You declined this request."}</p>
        </Card>
      ) : chat.status === "pending" && role === "requester" ? (
        <Card>
          <AutoRefresh ms={5_000} />
          <p className="text-sm">Request sent. Waiting for {name} to accept…</p>
          {chat.note && <p className="text-sm opacity-60">Your note: “{chat.note}”</p>}
        </Card>
      ) : chat.status === "pending" ? (
        <Card>
          <p className="text-sm">
            <b>{name}</b> wants to chat with you.
          </p>
          {chat.note && <p className="text-sm opacity-80">“{chat.note}”</p>}
          <RespondButtons chatId={chat.id} />
        </Card>
      ) : (
        <>
          <AutoRefresh ms={3_000} />
          {messages.length === 0 ? (
            <p className="text-center text-sm opacity-50">You&apos;re connected. Say hi 👋</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {messages.map((m) => {
                const mine = m.senderId === me;
                return (
                  <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <p
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap ${
                        mine ? "rounded-br-sm bg-[#1db954] text-black" : "rounded-bl-sm bg-current/10"
                      }`}
                    >
                      {m.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <ScrollToBottom count={messages.length} />
          <Composer chatId={chat.id} />
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-xl bg-current/5 p-4">{children}</section>;
}
