export type DashboardRange = { preset: string; fromIso: string; toIso: string; todayIso: string; prevFromIso: string; prevToIso: string; label: string; timeZone: string };
export type RevenueSeries = { dates: string[]; actualCents: number[]; priorCents: number[]; targetCents: number[] | null; actualTotalCents: number; priorTotalCents: number; targetTotalCents: number | null };
export type TodayRunJob = { id: string; status: string; type: string; scheduledStartTime: string | null; customerName: string; address: string; assignedTo: string[] };
export type TodayRun = { jobs: TodayRunJob[]; scheduled: number; completed: number; atRisk: number };
export type ExceptionCounts = { unassigned: number; missingHours: number; awaitingInvoice: number; paymentMethod: number; incompleteNotes: number; sync: number; lowSupplies: number };
export type PulseMetrics = { jobsToday: { scheduled: number; completed: number; atRisk: number }; revenue: { receivedCents: number; previousCents: number; hasData: boolean }; conversion: { sent: number; accepted: number; hasData: boolean }; collections: { overdueCents: number; overdueCount: number } };
export type CashToCollect = { totalCents: number; invoices: Array<{ id: string; customerId: string; customerName: string; amountDueCents: number; daysBeyondGrace: number }> };
export type CrewCoverage = { days: string[]; employees: Array<{ id: string; name: string; hoursByDay: number[]; ptoByDay: Array<"full" | "morning" | "afternoon" | null> }>; ptoCount: number };
export type OperationsDashboard = {
  clients: { total: number; gained: number; lost: number };
  quotes: { sent: number; accepted: number; booked: number; aging: number; previousSent: number; previousAccepted: number };
  weeklyRevenue: { dates: string[]; amountsCents: number[]; totalCents: number };
  weeklyRevenueTargetCents: number | null;
};
