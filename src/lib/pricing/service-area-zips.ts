/**
 * Zip → branch mapping for the company's two real service areas, provided
 * directly by the founder (2026-07-28) rather than derived from any existing
 * data — `travel_zones` is a separate, town-name-keyed dataset for quote
 * travel fees and does not reliably match branch boundaries (e.g. it has no
 * Tulsa entries at all and files Owasso under Bartlesville). This mapping is
 * the source of truth for which branch a job belongs to; the $/hr rate for
 * that branch is always read live from `service_locations.hourlyRateCents`
 * so a Settings change takes effect immediately without touching this file.
 * Branch names must match `service_locations.name` exactly ("Tulsa",
 * "Bartlesville"). If the company's territory changes, update this list.
 */
export const ZIP_TO_SERVICE_AREA_NAME: Record<string, string> = {
  // Tulsa branch
  "74008": "Tulsa", // Bixby
  "74037": "Tulsa", // Jenks
  "74105": "Tulsa",
  "74114": "Tulsa",
  "74129": "Tulsa",
  "74133": "Tulsa",
  "74134": "Tulsa",
  "74135": "Tulsa",
  "74136": "Tulsa",
  "74137": "Tulsa",
  "74145": "Tulsa",
  "74146": "Tulsa",
  "74055": "Tulsa", // Owasso
  "74073": "Tulsa", // Sperry
  "74033": "Tulsa", // Glenpool
  "74070": "Tulsa", // Skiatook
  "74011": "Tulsa", // Broken Arrow
  "74012": "Tulsa", // Broken Arrow
  "74014": "Tulsa", // Broken Arrow
  "74021": "Tulsa", // Collinsville

  // Bartlesville branch
  "74082": "Bartlesville", // Vera
  "74083": "Bartlesville", // Wann
  "74001": "Bartlesville", // Avant
  "74022": "Bartlesville", // Copan
  "74029": "Bartlesville", // Dewey
  "74048": "Bartlesville", // Nowata
  "74061": "Bartlesville", // Ramona
  "74080": "Bartlesville", // Talala
  "74056": "Bartlesville", // Bowring
  "74053": "Bartlesville", // Oologah
  "74027": "Bartlesville", // Delaware
  "74051": "Bartlesville", // Ochelata
  "74002": "Bartlesville", // Barnsdall
  "74003": "Bartlesville",
  "74006": "Bartlesville",
  "74042": "Bartlesville", // Lenapah
};

/** Extracts a 5-digit zip from a possibly-messy stored value ("74006", "74006-1234", " 74006 ") and resolves its branch name. */
export function resolveServiceAreaNameForZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const match = zip.match(/\d{5}/);
  if (!match) return null;
  return ZIP_TO_SERVICE_AREA_NAME[match[0]] ?? null;
}
