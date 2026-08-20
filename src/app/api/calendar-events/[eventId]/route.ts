import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { calendarEventAssignments, calendarEvents, users } from "@/db/schema";

const updateEventSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  durationMinutes: z.number().int().min(15).max(24 * 60).nullable().optional(),
  employeeIds: z.array(z.string().uuid()).max(50).optional(),
  status: z.literal("cancelled").optional(),
  timeOffType: z.enum(["paid", "unpaid"]).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const admin = await requireAdmin();
  const { eventId } = await params;

  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.companyId, admin.companyId)))
    .limit(1);
  if (!event) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  const assignments = await db
    .select({ userId: calendarEventAssignments.userId })
    .from(calendarEventAssignments)
    .where(eq(calendarEventAssignments.eventId, eventId));

  return NextResponse.json({ event: { ...event, employeeIds: assignments.map((a) => a.userId) } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const admin = await requireAdmin();
  const { eventId } = await params;
  const parsed = updateEventSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { employeeIds, ...fields } = parsed.data;

  const [existing] = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.companyId, admin.companyId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  if (employeeIds && employeeIds.length) {
    const staff = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, admin.companyId), inArray(users.id, employeeIds), eq(users.isActive, true)));
    if (staff.length !== employeeIds.length) {
      return NextResponse.json({ error: "Every selected employee must be active and in this company." }, { status: 400 });
    }
  }

  await db.transaction(async (tx) => {
    if (Object.keys(fields).length > 0) {
      await tx.update(calendarEvents).set(fields).where(eq(calendarEvents.id, eventId));
    }
    if (employeeIds) {
      await tx.delete(calendarEventAssignments).where(eq(calendarEventAssignments.eventId, eventId));
      if (employeeIds.length) {
        await tx.insert(calendarEventAssignments).values(employeeIds.map((userId) => ({ eventId, userId })));
      }
    }
  });

  return NextResponse.json({ ok: true });
}
