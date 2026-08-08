export const ROTATIONAL_TASKS = [
  {
    week: 1,
    label: "Week 1",
    weekly: "Edge Carpets",
    biweekly: "Edge Carpets and Cobweb Patrol",
    monthly: "ALL Rotational Tasks — Edge Carpet, Cobweb Patrol, Dust Blinds, Dust Air Returns/Vents",
  },
  {
    week: 2,
    label: "Week 2",
    weekly: "Cobweb Patrol",
    biweekly: "Edge Carpets and Cobweb Patrol",
    monthly: "ALL Rotational Tasks — Edge Carpet, Cobweb Patrol, Dust Blinds, Dust Air Returns/Vents",
  },
  {
    week: 3,
    label: "Week 3",
    weekly: "Dust Blinds",
    biweekly: "Dust Blinds and Dust Air Returns/Vents",
    monthly: "ALL Rotational Tasks — Edge Carpet, Cobweb Patrol, Dust Blinds, Dust Air Returns/Vents",
  },
  {
    week: 4,
    label: "Week 4",
    weekly: "Dust Air Returns/Vents",
    biweekly: "Dust Blinds and Dust Air Returns/Vents",
    monthly: "ALL Rotational Tasks — Edge Carpet, Cobweb Patrol, Dust Blinds, Dust Air Returns/Vents",
  },
] as const;

export type RotationalTaskWeek = (typeof ROTATIONAL_TASKS)[number];

export function rotationWeekForDate(seriesStartDate: string, scheduledDate: string) {
  const start = new Date(`${seriesStartDate}T00:00:00.000Z`);
  const date = new Date(`${scheduledDate}T00:00:00.000Z`);
  const elapsedWeeks = Math.max(0, Math.floor((date.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  return (elapsedWeeks % ROTATIONAL_TASKS.length) + 1;
}

export function rotationalTaskForDate(seriesStartDate: string | null, scheduledDate: string) {
  if (!seriesStartDate) return null;
  const currentWeek = rotationWeekForDate(seriesStartDate, scheduledDate);
  return {
    currentWeek,
    weeks: ROTATIONAL_TASKS,
    everyTime: "Couch under couch cushions",
  };
}
