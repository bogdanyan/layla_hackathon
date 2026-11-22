"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { requestChatAction, respondAction, sendMessageAction } from "@/app/chat-actions";

const MAX_NOTE = 200;

/** "Say hi" form: optional intro note + send request. */
export function RequestForm({ otherId, name }: { otherId: string; name: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          try {
            await requestChatAction(otherId, note);
          } catch {
            setError("Couldn't send the request. Try again.");
          }
        });
      }}
    >
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
        rows={3}
        placeholder={`Add a note for ${name} (optional)`}
        className="w-full resize-none rounded-xl border border-current/20 bg-transparent px-3 py-2 text-base"
      />
      <div className="flex items-center justify-between text-xs opacity-50">
        <span>They can reply once they accept.</span>
        <span>
          {note.length}/{MAX_NOTE}
        </span>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[#1db954] py-3 font-semibold text-black active:opacity-80 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send chat request"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  );
}

export function RespondButtons({ chatId }: { chatId: number }) {
  const [pending, start] = useTransition();
  const act = (accept: boolean) => start(() => respondAction(chatId, accept));
  return (
    <div className="flex gap-2">
      <button
        onClick={() => act(true)}
        disabled={pending}
        className="flex-1 rounded-full bg-[#1db954] py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        Accept
      </button>
      <button
        onClick={() => act(false)}
        disabled={pending}
        className="flex-1 rounded-full border border-current/30 py-2 text-sm opacity-70 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}

/** Message input, fixed above the bottom nav. */
export function Composer({ chatId }: { chatId: number }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const send = () => {
    const body = text.trim();
    if (!body || pending) return;
    start(async () => {
      try {
        await sendMessageAction(chatId, body);
        setText("");
      } catch {
        // keep the text so the user can retry
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 mx-auto flex w-full max-w-md gap-2 border-t border-current/10 bg-background/95 px-4 py-2 backdrop-blur"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        placeholder="Message"
        className="min-w-0 flex-1 rounded-full border border-current/20 bg-transparent px-4 py-2 text-base"
      />
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="rounded-full bg-[#1db954] px-4 text-sm font-semibold text-black disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}

/** Scrolls to the bottom when the message count changes. */
export function ScrollToBottom({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [count]);
  return <div ref={ref} />;
}
