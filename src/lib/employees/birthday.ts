export const BIRTHDAY_PATTERN = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidBirthday(value: string) {
  if (!BIRTHDAY_PATTERN.test(value)) return false;
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatBirthday(value: string | null) {
  if (!value || !isValidBirthday(value)) return value || "Not set";
  const [month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(2000, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
