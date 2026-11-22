"use server";

import { refresh } from "next/cache";
import { auth } from "@/auth";
import { requestChat, respond, sendMessage } from "@/lib/chat";

async function me() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function requestChatAction(otherId: string, note: string) {
  await requestChat(await me(), otherId, note);
  refresh();
}

export async function respondAction(chatId: number, accept: boolean) {
  await respond(await me(), chatId, accept);
  refresh();
}

export async function sendMessageAction(chatId: number, body: string) {
  await sendMessage(await me(), chatId, body);
  refresh();
}
