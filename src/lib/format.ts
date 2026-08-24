export function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function compactMoney(cents: number) {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return money(cents);
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatTime(value: string | null | undefined, empty = "—") {
  if (!value) return empty;
  const [hours, minutes] = value.split(":").map((part) => Number(part || 0));
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", sbquo: "‚",
  rdquo: "”", ldquo: "“", bdquo: "„",
  ndash: "–", mdash: "—", hellip: "…",
  deg: "°", copy: "©", reg: "®", trade: "™",
  middot: "·", bull: "•",
};

// Matches a legacy intake-form field label like "Key #:", "# Names:", or
// "Special Instructions:" — an uppercase- or "#"-led run of characters
// ending in a colon.
const LEGACY_LABEL = /[A-Z#][A-Za-z0-9 /#&']{0,30}:/g;

/**
 * The same bulk import (see cleanNoteText below) left whole unfilled
 * template fields in place — "Pet Instructions: Dogs: # Names: Cats: #
 * Names:" when no pet details were ever entered, or a "Special
 * Instructions:" label appended a second time with nothing after it. A
 * label followed by nothing but another label (or the end of the string)
 * carries no information, so drop it; a label followed by real content is
 * left untouched.
 */
function stripEmptyLegacyLabels(text: string): string {
  const matches = [...text.matchAll(LEGACY_LABEL)];
  if (!matches.length) return text;
  const parts: string[] = [];
  const lead = text.slice(0, matches[0].index ?? 0).trim();
  if (lead) parts.push(lead);
  for (let i = 0; i < matches.length; i++) {
    const label = matches[i][0];
    const start = (matches[i].index ?? 0) + label.length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const fieldValue = text.slice(start, end).trim();
    if (fieldValue) parts.push(`${label} ${fieldValue}`);
  }
  return parts.join(" ").replace(/ {2,}/g, " ").trim();
}

/**
 * Old customer notes were bulk-imported from an HTML export (see HANDOFF.md's
 * TheCustomerFactor CSV backfill) with entities like "&rsquo;"/"&amp;"/"&#39;"
 * left un-decoded, plus raw \r\n/tab clutter — decode + normalize so notes
 * read as text instead of "Don&rsquo;t adjust the bed&hellip;".
 */
export function cleanNoteText(value: string | null | undefined): string {
  if (!value) return "";
  const decoded = value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return HTML_NAMED_ENTITIES[entity] ?? match;
  });
  const normalized = decoded
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripEmptyLegacyLabels(normalized);
}
