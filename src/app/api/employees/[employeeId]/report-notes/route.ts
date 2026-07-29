import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { employeeReportNotes, users } from "@/db/schema";

const noteSchema = z.object({ note: z.string().trim().min(1).max(10000), reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const notes = await db.select({ id: employeeReportNotes.id, note: employeeReportNotes.note, reportDate: employeeReportNotes.reportDate, createdAt: employeeReportNotes.createdAt, authorFirstName: users.firstName, authorLastName: users.lastName }).from(employeeReportNotes).innerJoin(users, eq(employeeReportNotes.authorUserId, users.id)).where(and(eq(employeeReportNotes.companyId, admin.companyId), eq(employeeReportNotes.employeeId, employeeId))).orderBy(desc(employeeReportNotes.reportDate), desc(employeeReportNotes.createdAt));
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const parsed = noteSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [employee] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId))).limit(1);
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  const [note] = await db.insert(employeeReportNotes).values({ companyId: admin.companyId, employeeId, authorUserId: admin.id, note: parsed.data.note, reportDate: parsed.data.reportDate }).returning();
  return NextResponse.json({ note }, { status: 201 });
}
