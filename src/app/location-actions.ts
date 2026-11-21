"use server";

import { auth } from "@/auth";
import { clearLocation, isValidLatLng, setLocation } from "@/lib/location";

export async function updateMyLocation(lat: number, lng: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (!isValidLatLng(lat, lng)) throw new Error("Invalid coordinates");
  await setLocation(session.user.id, lat, lng); // rounds to ~1 km server-side
}

export async function stopSharingLocation() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  await clearLocation(session.user.id);
}
