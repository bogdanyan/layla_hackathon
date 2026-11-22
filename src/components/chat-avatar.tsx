/* eslint-disable @next/next/no-img-element -- Spotify CDN images */
import type { ChatUser } from "@/lib/chat";

export const chatName = (u: Pick<ChatUser, "displayName">) => u.displayName ?? "Spotify user";

export function Avatar({ user, size = "h-8 w-8" }: { user: Pick<ChatUser, "imageUrl">; size?: string }) {
  return user.imageUrl ? (
    <img src={user.imageUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${size} shrink-0 rounded-full bg-current/10`} />
  );
}
