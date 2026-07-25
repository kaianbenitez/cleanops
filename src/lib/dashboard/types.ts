export type DashboardRange = { preset: string; fromIso: string; toIso: string; todayIso: string; prevFromIso: string; prevToIso: string; label: string };
export type TodayRunJob = { id: string; status: string; type: string; scheduledStartTime: string | null; customerName: string; address: string; assignedTo: string[] };
export type TodayRun = { jobs: TodayRunJob[]; scheduled: number; completed: number; atRisk: number };
export type ExceptionCounts = { unassigned: number; missingHours: number; awaitingInvoice: number; paymentMethod: number; incompleteNotes: number; sync: number; lowSupplies: number };
export type PulseMetrics = { jobsToday: { scheduled: number; completed: number; atRisk: number }; revenue: { receivedCents: number; previousCents: number; hasData: boolean }; conversion: { sent: number; accepted: number; hasData: boolean }; collections: { overdueCents: number; overdueCount: number } };
