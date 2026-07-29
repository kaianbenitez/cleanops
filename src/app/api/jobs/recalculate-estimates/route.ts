import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { refreshJobTicketHours } from "@/lib/payroll/job-ticket-hours";

/** Rebuild active jobs' stored JTH from their linked quote; manual JTH is retained. */
export async function POST() {
  const admin = await requireAdmin();
  const result = await refreshJobTicketHours({ companyId: admin.companyId });
  return NextResponse.json(result);
}
