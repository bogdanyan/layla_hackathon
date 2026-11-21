"use server";

import { signIn, signOut } from "@/auth";

export async function connectSpotify() {
  await signIn("spotify", { redirectTo: "/" });
}

export async function logOut() {
  await signOut({ redirectTo: "/" });
}
