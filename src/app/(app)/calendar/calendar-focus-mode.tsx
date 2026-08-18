"use client";

import { useEffect, useState } from "react";
import { PanelLeft } from "lucide-react";

const STORAGE_KEY = "co-calendar-focus-mode";

// Calendar is the one screen where vertical/horizontal space is scarce
// enough to justify hiding the app nav and top bar entirely. Defaults to
// hidden (focused) on first visit; the choice persists across visits via
// localStorage. Clears the attribute on unmount so leaving Calendar always
// restores the nav on every other page, regardless of the stored choice.
export default function CalendarFocusMode() {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    // Reading localStorage after mount, same pattern as today-list-board.tsx's clock init.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocused(localStorage.getItem(STORAGE_KEY) !== "off");
  }, []);

  useEffect(() => {
    if (focused) document.documentElement.dataset.focusMode = "calendar";
    else delete document.documentElement.dataset.focusMode;
    return () => {
      delete document.documentElement.dataset.focusMode;
    };
  }, [focused]);

  function toggle() {
    setFocused((current) => {
      const next = !current;
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!focused}
      aria-label={focused ? "Show navigation" : "Hide navigation"}
      className="co-button-secondary flex h-9 w-9 shrink-0 items-center justify-center !p-0"
    >
      <PanelLeft className="h-4 w-4" aria-hidden />
    </button>
  );
}
