export const ADD_ONS = [
  { key: "inside_windows", label: "Inside windows", priceCents: 4500, keywords: ["window"] },
  { key: "oven_interior", label: "Oven interior", priceCents: 3500, keywords: ["oven"] },
  { key: "fridge_interior", label: "Fridge interior", priceCents: 3500, keywords: ["fridge", "refrigerator"] },
  { key: "baseboards", label: "Baseboards", priceCents: 2500, keywords: ["baseboard"] },
  { key: "cabinet_fronts", label: "Cabinet fronts", priceCents: 3000, keywords: ["cabinet"] },
  { key: "laundry", label: "Laundry / folding", priceCents: 5000, keywords: ["laundry", "fold"] },
] as const;

export type AddOnKey = (typeof ADD_ONS)[number]["key"];

/** Loose keyword match against free-text customer notes (e.g. a GHL intake form
 * submission) so the admin doesn't have to re-read notes to notice an add-on request. */
export function detectRequestedAddOns(text: string): AddOnKey[] {
  const lower = text.toLowerCase();
  return ADD_ONS.filter((addOn) => addOn.keywords.some((keyword) => lower.includes(keyword))).map((addOn) => addOn.key);
}
