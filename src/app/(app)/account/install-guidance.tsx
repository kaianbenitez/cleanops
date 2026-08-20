"use client";

import { useEffect, useState } from "react";
import { Share } from "lucide-react";
import { isIosSafariBrowserTab } from "../install-hint-banner";

export default function InstallGuidance() {
  const [isIosSafari, setIsIosSafari] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- UA is unavailable during SSR, so eligibility can only be read once mounted.
    setIsIosSafari(isIosSafariBrowserTab());
  }, []);

  return (
    <div className="space-y-2">
      <p className="type-field-body text-[var(--co-muted)]">
        Add Shimmer to your Home Screen so it opens like an app and you sign in less often.
      </p>
      {isIosSafari ? (
        <p className="flex items-center gap-2 type-field-meta text-[var(--co-faint)]">
          <Share aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" />
          Tap Share, then Add to Home Screen.
        </p>
      ) : null}
    </div>
  );
}
