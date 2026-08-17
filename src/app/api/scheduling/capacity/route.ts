import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { getCapacityForRange } from "@/lib/scheduling/capacity";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// A calendar month plus lead-in/lead-out weeks is comfortably under this;
// this just stops an unbounded range from turning into a slow query.
const MAX_RANGE_DAYS = 62;

/** GET /api/scheduling/capacity?start=YYYY-MM-DD&end=YYYY-MM-DD — per-day
 * free-hours for the calendar picker. Admin-scoped, company-scoped. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end") ?? start;
  if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
  }
  if (end < start) {
    return NextResponse.json({ error: "end must not be before start." }, { status: 400 });
  }
  const rangeDays = (new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime()) / 86_400_000 + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range cannot exceed ${MAX_RANGE_DAYS} days.` }, { status: 400 });
  }

  const days = await getCapacityForRange({ companyId: admin.companyId, startDate: start, endDate: end });
  return NextResponse.json({ days });
}
