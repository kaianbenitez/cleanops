"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const STORAGE_KEY = "co-a2hs-dismissed";

function isIosSafariBrowserTab() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

/**
 * iOS fires no `beforeinstallprompt`, so Add to Home Screen can only be
 * told to the user, not automated. Shown only in an iOS Safari browser
 * tab (not once installed), dismissal persists across visits.
 */
export default function InstallHintBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    if (!dismissed && isIosSafariBrowserTab()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- UA/localStorage are unavailable during SSR, so eligibility can only be read once mounted.
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="flex items-center gap-2 bg-[var(--co-accent)] px-3 py-2 text-[13px] text-white">
      <Share aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate">
        Install ServiceSpark: tap <span className="font-medium">Share</span> then{" "}
        <span className="font-medium">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install hint"
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/15"
      >
        <X aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
      </button>
    </div>
  );
}
