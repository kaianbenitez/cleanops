import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, jobPhotos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_req: Request, { params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const admin = await requireAdmin();
  const { jobId, photoId } = await params;
  const [photo] = await db.select().from(jobPhotos).where(and(eq(jobPhotos.id, photoId), eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, admin.companyId))).limit(1);
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const { error } = await createAdminClient().storage.from("job-photos").remove([photo.storagePath]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await db.delete(jobPhotos).where(eq(jobPhotos.id, photo.id));
  await db.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: "job.photo_deleted", entityType: "job", entityId: jobId, before: { photoId }, after: null });
  return NextResponse.json({ ok: true });
}
