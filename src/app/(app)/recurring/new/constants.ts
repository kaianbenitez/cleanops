export const FREQUENCIES = ["weekly", "biweekly", "every4weeks", "monthly"] as const;

export type SeriesFrequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<SeriesFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  every4weeks: "Every 4 weeks",
  monthly: "Monthly",
};

/** Ordered Monday-first for scheduling, but the values are JS `getDay()`
 * numbers (0 = Sunday) because that is what `computeOccurrences` compares
 * against in `src/lib/scheduling/generate-jobs.ts`. */
export const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];
