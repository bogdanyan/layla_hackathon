# Chat

1:1 chat between users, but only after a **chat request** is accepted. You reach people from the Nearby tab ("💬 Hi" on nearby rows and taste-twin cards) or from the Chat tab.

## Data (`src/db/schema.ts`)
- `chats`: one row per pair of users (either direction): `requesterId`, `recipientId`, `status` (`pending | accepted | declined`), `note` (optional intro, max 200 chars). Unique on `(requesterId, recipientId)`. The code also checks the reverse pair, so a pair never has two rows.
- `messages`: `chatId`, `senderId`, `body` (max 1000 chars), `createdAt`.

## Code
- `src/lib/chat.ts` (server-only):
  - `getChatState(me, other)` returns the other user, the chat (or `null`), my `role`, and messages (only when accepted).
  - `listChats(me)` returns `{ incoming, active, outgoing }`. `active` is sorted by latest message.
  - `requestChat(me, other, note?)` creates a pending chat. If the other person already asked me, it accepts their request instead.
  - `respond(me, chatId, accept)`: only the recipient of a pending chat can call it. On accept, the note is copied in as the first message.
  - `sendMessage(me, chatId, body)`: the sender must be a participant and the chat must be accepted.
- `src/app/chat-actions.ts`: server actions (`requestChatAction`, `respondAction`, `sendMessageAction`). Each one calls `refresh()`.
- `src/app/chat/page.tsx` is the Chat tab (Requests / Messages / Sent requests) and reloads every 10 s.
- `src/app/chat/[userId]/page.tsx` is the thread with a user. It shows the request form, waiting, accept/decline or declined state until the chat is accepted, then the messages and composer. It reloads every 3 s.
- `src/components/chat-forms.tsx` holds the client parts: `RequestForm`, `RespondButtons`, `Composer`, `ScrollToBottom`. `src/components/chat-avatar.tsx` holds `Avatar` and `chatName`.

## Realtime
There are no websockets. Pages poll with `<AutoRefresh ms />` (`router.refresh()`). That's enough for a demo. Swap in Supabase Realtime later if needed.

## Demo users
Demo users (`spotifyId` starting with `demo:`, display name ending in " (DEMO)") have nobody behind them:
- A request to a demo user is accepted immediately. Your note becomes the first message and the demo user sends a greeting.
- Every message you send to a demo user gets one random canned reply (`DEMO_REPLIES`).
- Re-seeding deletes demo users, and their chats are deleted with them.
