"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// `session.expires_at` is the short-lived access token's expiry (~1h), not
// the ~400-day cookie/refresh-token lifetime that actually governs how long
// this phone stays signed in (see cookie-options.ts). Showing it as "stays
// signed in until" would promise a duration we haven't verified, so this
// intentionally never renders a specific date.
export default function SessionStatus() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(Boolean(data.session));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn === false) return null;

  return <p className="type-field-body text-[var(--co-ink)]">Signed in on this phone</p>;
}
