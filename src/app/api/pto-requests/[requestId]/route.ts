import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { ptoRequests } from "@/db/schema";

export async function DELETE(_req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const user = await requireUser();
  const { requestId } = await params;
  const [cancelled] = await db.update(ptoRequests).set({ status: "cancelled" }).where(and(
    eq(ptoRequests.id, requestId),
    eq(ptoRequests.companyId, user.companyId),
    eq(ptoRequests.userId, user.id),
    eq(ptoRequests.status, "pending"),
  )).returning({ id: ptoRequests.id });
  if (!cancelled) return NextResponse.json({ error: "Only a pending request can be cancelled." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
