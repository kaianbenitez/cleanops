import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";

const bucket = "employee-photos";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const [employee] = await db.select().from(users).where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId))).limit(1);
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const file = (await req.formData()).get("photo");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > maxBytes) {
    return NextResponse.json({ error: "Upload a JPG, PNG, or WebP image up to 5 MB." }, { status: 400 });
  }

  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${admin.companyId}/${employeeId}/${crypto.randomUUID()}.${extension}`;
  const storage = createAdminClient().storage.from(bucket);
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  if (employee.profilePhotoUrl) await storage.remove([employee.profilePhotoUrl]);
  await db.update(users).set({ profilePhotoUrl: path }).where(eq(users.id, employeeId));
  await db.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: "employee.photo_uploaded", entityType: "employee", entityId: employeeId, before: { profilePhotoUrl: employee.profilePhotoUrl }, after: { profilePhotoUrl: path } });
  const { data } = await storage.createSignedUrl(path, 60 * 60);
  return NextResponse.json({ profilePhotoUrl: data?.signedUrl ?? null });
}
