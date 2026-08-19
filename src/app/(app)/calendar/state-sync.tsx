"use client";

import { useEffect } from "react";

const COOKIE_NAME = "co_calendar_state";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function readCookie(): Record<string, string> {
  const match = document.cookie.split("; ").find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  if (!match) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Remembers the last view + axis + anchor date the admin looked at, so
 * landing on a bare `/calendar` link (nav, "back to calendar", etc.) restores
 * it instead of always jumping back to today. Explicit query params always
 * win over the cookie — see the fallback in page.tsx — this only writes the
 * cookie. Only the field for the *current* view is updated so switching
 * views doesn't clobber the remembered anchor for the other views. `axis` is
 * written unconditionally (not just while on `board`) so it survives a trip
 * through Week/Month/Day and is there the next time Board is opened —
 * including from a Month day-cell link, see month-board.tsx. */
export default function CalendarStateSync({
  view,
  axis,
  anchor,
}: {
  view: "board" | "week" | "month" | "list";
  axis: "vertical" | "horizontal";
  anchor: string;
}) {
  useEffect(() => {
    const field = view === "board" || view === "list" ? "day" : view === "week" ? "week" : "month";
    const next = { ...readCookie(), view, axis, [field]: anchor };
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  }, [view, axis, anchor]);

  return null;
}
