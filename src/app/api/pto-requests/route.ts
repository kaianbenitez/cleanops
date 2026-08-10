import { NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ptoRequests } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { notifyAdmins } from "@/lib/notifications/create";

const requestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startPeriod: z.enum(["full", "morning", "afternoon"]).default("full"),
  endPeriod: z.enum(["full", "morning", "afternoon"]).default("full"),
  note: z.string().trim().max(240).optional().nullable(),
}).refine((value) => value.startDate <= value.endDate, {
  message: "The end date must be on or after the start date.",
  path: ["endDate"],
});

export async function GET() {
  const user = await requireUser();
  const requests = await db.select({
    id: ptoRequests.id,
    startDate: ptoRequests.startDate,
    endDate: ptoRequests.endDate,
    startPeriod: ptoRequests.startPeriod,
    endPeriod: ptoRequests.endPeriod,
    note: ptoRequests.note,
    status: ptoRequests.status,
    createdAt: ptoRequests.createdAt,
    decidedAt: ptoRequests.decidedAt,
  }).from(ptoRequests).where(and(eq(ptoRequests.companyId, user.companyId), eq(ptoRequests.userId, user.id))).orderBy(desc(ptoRequests.createdAt));
  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid PTO request." }, { status: 400 });

  const [created] = await db.insert(ptoRequests).values({
    companyId: user.companyId,
    userId: user.id,
    ...parsed.data,
    note: parsed.data.note || null,
  }).returning();

  const dates = created.startDate === created.endDate ? created.startDate : `${created.startDate} to ${created.endDate}`;
  await notifyAdmins({
    companyId: user.companyId,
    type: "pto.requested",
    title: `${user.firstName} ${user.lastName} requested time off`,
    body: dates,
    href: `/employees/${user.id}`,
  });

  return NextResponse.json({ request: created }, { status: 201 });
}
