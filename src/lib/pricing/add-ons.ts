export type AddOnKey = "inside_windows" | "oven_interior" | "fridge_interior" | "baseboards" | "cabinet_fronts" | "laundry";

export type AddOn = {
  key: AddOnKey;
  label: string;
  /** Flat price in cents, or the per-unit price when `quantified` is true, or null when the
   * price varies too much to quote instantly (see `priceLabel`). */
  priceCents: number | null;
  /** Shown instead of a computed price when `priceCents` is null. */
  priceLabel?: string;
  description?: string;
  keywords: string[];
  /** True when the customer enters a count (e.g. "how many ovens") and `priceCents` is a
   * per-unit rate. Add-ons without this stay a single flat charge with no quantity control. */
  quantified?: boolean;
};

/** What actually gets stored in `quotes.accepted_add_ons` (and shown while building a quote). */
export type SelectedAddOn = { key: AddOnKey; qty: number };

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
    quantified: true,
  },
  {
    key: "fridge_interior",
    label: "Refrigerator Clean Out (freezer not included)",
    priceCents: 5000,
    description:
      "Removes all items, wipes down and sanitizes shelves/drawers/door compartments, and eliminates spills, stains, and odors from the refrigerator section.",
    keywords: ["fridge", "refrigerator"],
    quantified: true,
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

export const MAX_ADD_ON_QTY = 50;

/** Normalizes one `accepted_add_ons` array entry. Rows written before quantities existed are a
 * bare `AddOnKey` string — treat those as qty 1, and never rewrite the old row in place. */
export function normalizeAddOnEntry(entry: unknown): SelectedAddOn | null {
  if (typeof entry === "string") {
    return ADD_ONS.some((addOn) => addOn.key === entry) ? { key: entry as AddOnKey, qty: 1 } : null;
  }
  if (entry && typeof entry === "object" && "key" in entry) {
    const key = (entry as Record<string, unknown>).key;
    const qty = (entry as Record<string, unknown>).qty;
    if (typeof key !== "string" || !ADD_ONS.some((addOn) => addOn.key === key)) return null;
    const normalizedQty = typeof qty === "number" && Number.isInteger(qty) && qty >= 1 && qty <= MAX_ADD_ON_QTY ? qty : 1;
    return { key: key as AddOnKey, qty: normalizedQty };
  }
  return null;
}

export function normalizeAddOns(raw: unknown): SelectedAddOn[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeAddOnEntry).filter((entry): entry is SelectedAddOn => entry !== null);
}

/** Line total for one selected add-on. Quantity only multiplies price for `quantified`
 * add-ons — a flat add-on always charges once no matter what `qty` says. */
export function addOnLineTotalCents(addOn: AddOn, qty: number) {
  if (addOn.priceCents == null) return 0;
  return addOn.quantified ? addOn.priceCents * qty : addOn.priceCents;
}
