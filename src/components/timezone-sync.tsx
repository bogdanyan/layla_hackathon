"use client";

import { useEffect } from "react";
import { setTimezone } from "@/app/actions";

/** Tells the server the browser's timezone (once, or when it changes). Renders nothing. */
export function TimezoneSync({ current }: { current: string | null }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) setTimezone(tz).catch(() => {});
  }, [current]);
  return null;
}
