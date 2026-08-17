"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type AddressParts = { addressLine1: string; city: string; state: string; zip: string; county: string; googlePlaceId: string };
type Props = { value: string; onChange: (value: string) => void; onAddressSelected: (parts: AddressParts) => void };

function componentValue(components: Array<{ types?: string[]; long_name?: string; short_name?: string }>, type: string, short = false) {
  const match = components.find((component) => component.types?.includes(type));
  return short ? match?.short_name ?? "" : match?.long_name ?? "";
}

export default function AddressAutocomplete({ value, onChange, onAddressSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(Boolean(typeof window !== "undefined" && window.google?.maps?.places));

  useEffect(() => {
    fetch("/api/integrations/maps-key").then(async (response) => {
      if (!response.ok) return;
      const body = await response.json().catch(() => ({}));
      setApiKey(typeof body.apiKey === "string" ? body.apiKey : null);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!apiKey || !inputRef.current || (!googleReady && !window.google?.maps?.places)) return;
    const Autocomplete = window.google?.maps?.places?.Autocomplete;
    if (!Autocomplete) return;
    const autocomplete = new Autocomplete(inputRef.current, {
      types: ["address"], componentRestrictions: { country: "us" }, fields: ["address_components", "formatted_address", "place_id"],
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const components = place.address_components ?? [];
      const addressLine1 = [componentValue(components, "street_number"), componentValue(components, "route")].filter(Boolean).join(" ") || place.formatted_address || "";
      onChange(addressLine1);
      onAddressSelected({ addressLine1, city: componentValue(components, "locality") || componentValue(components, "postal_town"), state: componentValue(components, "administrative_area_level_1", true), zip: componentValue(components, "postal_code"), county: componentValue(components, "administrative_area_level_2"), googlePlaceId: place.place_id ?? "" });
    });
    return () => listener.remove();
  }, [apiKey, googleReady, onAddressSelected, onChange]);

  return <>
    {apiKey && <Script id="google-maps-places" src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`} strategy="afterInteractive" onLoad={() => setGoogleReady(true)} />}
    <input ref={inputRef} className="co-input w-full" value={value} onChange={(event) => onChange(event.target.value)} placeholder={apiKey ? "Start typing an address..." : "Street address"} />
    {apiKey ? <p className="mt-1 text-xs text-[var(--co-muted)]">Choose a suggestion to fill city, state, ZIP, and county.</p> : <p className="mt-1 text-xs text-[var(--co-warning)]">Ask an administrator to configure Google Maps to enable suggestions.</p>}
  </>;
}
