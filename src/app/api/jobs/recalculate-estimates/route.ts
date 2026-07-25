import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { refreshJobTicketHours } from "@/lib/payroll/job-ticket-hours";

/** Rebuild active jobs' stored estimates from amount due and the applicable area rate. */
export async function POST() {
  const admin = await requireAdmin();
  const result = await refreshJobTicketHours({ companyId: admin.companyId });
  return NextResponse.json(result);
}
