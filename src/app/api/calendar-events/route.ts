import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { calendarEventAssignments, calendarEvents, users } from "@/db/schema";

const eventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).nullable().optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isAllDay: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  durationMinutes: z.number().int().min(15).max(24 * 60).nullable().optional(),
  employeeIds: z.array(z.string().uuid()).max(50),
}).superRefine((event, ctx) => {
  if (!event.isAllDay && (!event.startTime || !event.durationMinutes)) ctx.addIssue({ code: "custom", message: "Timed events need a start time and duration." });
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end") ?? start;
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
  const rows = await db.select().from(calendarEvents).where(and(eq(calendarEvents.companyId, admin.companyId), gte(calendarEvents.scheduledDate, start), lte(calendarEvents.scheduledDate, end))).orderBy(asc(calendarEvents.scheduledDate), asc(calendarEvents.startTime));
  const ids = rows.map((row) => row.id);
  const assignments = ids.length ? await db.select({ eventId: calendarEventAssignments.eventId, userId: calendarEventAssignments.userId }).from(calendarEventAssignments).where(inArray(calendarEventAssignments.eventId, ids)) : [];
  return NextResponse.json({ events: rows.map((event) => ({ ...event, employeeIds: assignments.filter((assignment) => assignment.eventId === event.id).map((assignment) => assignment.userId) })) });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = eventSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  if (data.employeeIds.length) {
    const staff = await db.select({ id: users.id }).from(users).where(and(eq(users.companyId, admin.companyId), inArray(users.id, data.employeeIds), eq(users.isActive, true)));
    if (staff.length !== data.employeeIds.length) return NextResponse.json({ error: "Every selected employee must be active and in this company." }, { status: 400 });
  }
  const event = await db.transaction(async (tx) => {
    const [created] = await tx.insert(calendarEvents).values({ companyId: admin.companyId, title: data.title, note: data.note ?? null, scheduledDate: data.scheduledDate, isAllDay: data.isAllDay, startTime: data.isAllDay ? null : data.startTime!, durationMinutes: data.isAllDay ? null : data.durationMinutes!, createdByUserId: admin.id }).returning();
    if (data.employeeIds.length) await tx.insert(calendarEventAssignments).values(data.employeeIds.map((userId) => ({ eventId: created.id, userId })));
    return created;
  });
  return NextResponse.json({ event: { ...event, employeeIds: data.employeeIds } }, { status: 201 });
}
