import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, customers, jobAssignments, jobPhotos, jobs, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmins } from "@/lib/notifications/create";

const bucket = "job-photos";
const accepted = new Set(["image/jpeg", "image/png", "image/webp"]);
const slots = new Set(["before", "after", "extra"]);

async function authorize(jobId: string) {
  const user = await requireUser();
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.companyId, user.companyId))).limit(1);
  if (!job) return { user, allowed: false };
  if (user.role === "admin") return { user, allowed: true };
  const [assignment] = await db.select({ id: jobAssignments.id }).from(jobAssignments).where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, user.id))).limit(1);
  return { user, allowed: Boolean(assignment) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const { allowed } = await authorize(jobId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.select({ id: jobPhotos.id, slot: jobPhotos.slot, caption: jobPhotos.caption, storagePath: jobPhotos.storagePath, createdAt: jobPhotos.createdAt, firstName: users.firstName, lastName: users.lastName })
    .from(jobPhotos).innerJoin(users, eq(jobPhotos.uploadedByUserId, users.id)).where(eq(jobPhotos.jobId, jobId)).orderBy(desc(jobPhotos.createdAt));
  const storage = createAdminClient().storage.from(bucket);
  const photos = await Promise.all(rows.map(async (row) => {
    const { data } = await storage.createSignedUrl(row.storagePath, 60 * 60);
    return { ...row, url: data?.signedUrl ?? null, uploadedBy: `${row.firstName} ${row.lastName}` };
  }));
  return NextResponse.json({ photos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const { user, allowed } = await authorize(jobId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("photo");
  const slot = String(form.get("slot") ?? "extra");
  const caption = String(form.get("caption") ?? "").trim().slice(0, 500) || null;
  if (!(file instanceof File) || !accepted.has(file.type) || file.size > 5 * 1024 * 1024 || !slots.has(slot)) {
    return NextResponse.json({ error: "Upload a JPG, PNG, or WebP image up to 5 MB." }, { status: 400 });
  }
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${user.companyId}/${jobId}/${crypto.randomUUID()}.${extension}`;
  const storage = createAdminClient().storage.from(bucket);
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
  const [photo] = await db.insert(jobPhotos).values({ jobId, companyId: user.companyId, uploadedByUserId: user.id, storagePath: path, slot: slot as "before" | "after" | "extra", caption }).returning();
  await db.insert(auditLog).values({ companyId: user.companyId, userId: user.id, action: "job.photo_uploaded", entityType: "job", entityId: jobId, before: null, after: { photoId: photo.id, slot, caption } });
  if (slot === "before" || slot === "after") {
    const [jobCustomer] = await db.select({ customerId: jobs.customerId, firstName: customers.firstName, lastName: customers.lastName }).from(jobs).innerJoin(customers, eq(jobs.customerId, customers.id)).where(eq(jobs.id, jobId)).limit(1);
    if (jobCustomer) {
      await notifyAdmins({
        companyId: user.companyId,
        type: "job.photo_added",
        title: `${slot === "before" ? "Before" : "After"} photo added`,
        body: `${jobCustomer.firstName} ${jobCustomer.lastName}`,
        href: `/jobs/${jobId}`,
        customerId: jobCustomer.customerId,
      });
    }
  }
  const { data } = await storage.createSignedUrl(path, 60 * 60);
  return NextResponse.json({ photo: { ...photo, url: data?.signedUrl ?? null } }, { status: 201 });
}
