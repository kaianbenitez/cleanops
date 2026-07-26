export type AddOnKey = "inside_windows" | "oven_interior" | "fridge_interior" | "baseboards" | "cabinet_fronts" | "laundry";

export type AddOn = {
  key: AddOnKey;
  label: string;
  /** Flat price in cents, or null when the price varies too much to quote instantly (see `priceLabel`). */
  priceCents: number | null;
  /** Shown instead of a computed price when `priceCents` is null. */
  priceLabel?: string;
  description?: string;
  keywords: string[];
};

export const ADD_ONS: AddOn[] = [
  {
    key: "inside_windows",
    label: "Window Cleaning",
    priceCents: null,
    priceLabel: "$10–$20 per window",
    description:
      "Priced per window based on type and count — our scheduler will confirm the exact total with you directly.",
    keywords: ["window"],
  },
  {
    key: "oven_interior",
    label: "Oven Clean Out",
    priceCents: 2000,
    description:
      "Removes loose debris and crumbs, deep cleans racks/walls/door interior, and wipes down exterior surfaces and knobs. Does not include stovetop burners.",
    keywords: ["oven"],
  },
  {
    key: "fridge_interior",
    label: "Refrigerator Clean Out (freezer not included)",
    priceCents: 5000,
    description:
      "Removes all items, wipes down and sanitizes shelves/drawers/door compartments, and eliminates spills, stains, and odors from the refrigerator section.",
    keywords: ["fridge", "refrigerator"],
  },
  { key: "baseboards", label: "Baseboards", priceCents: 2500, keywords: ["baseboard"] },
  { key: "cabinet_fronts", label: "Cabinet fronts", priceCents: 3000, keywords: ["cabinet"] },
  { key: "laundry", label: "Laundry / folding", priceCents: 5000, keywords: ["laundry", "fold"] },
];

/** Add-ons included in a Move In/Out quote. Window cleaning remains separately
 * priced per window, so it must always be an explicit customer selection. */
export const MOVE_IN_OUT_DEFAULT_ADD_ONS: AddOnKey[] = ["oven_interior", "fridge_interior"];

/** Loose keyword match against free-text customer notes (e.g. a GHL intake form
 * submission) so the admin doesn't have to re-read notes to notice an add-on request. */
export function detectRequestedAddOns(text: string): AddOnKey[] {
  const lower = text.toLowerCase();
  return ADD_ONS.filter((addOn) => addOn.keywords.some((keyword) => lower.includes(keyword))).map((addOn) => addOn.key);
}
