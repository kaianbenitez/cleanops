import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "employee-profile-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const [employee] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId), eq(users.role, "employee")))
    .limit(1);

  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const formData = await request.formData();
  const photo = formData.get("photo");
  if (!(photo instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  if (photo.size > MAX_BYTES) return NextResponse.json({ error: "Profile photos must be 5 MB or smaller." }, { status: 400 });

  const extension = CONTENT_TYPES.get(photo.type);
  if (!extension) return NextResponse.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
  if (bucketListError) return NextResponse.json({ error: "Could not access photo storage." }, { status: 500 });
  if (!buckets.some((bucket) => bucket.name === BUCKET)) {
    const { error: createBucketError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: [...CONTENT_TYPES.keys()],
      fileSizeLimit: MAX_BYTES,
    });
    if (createBucketError) return NextResponse.json({ error: "Could not initialize photo storage." }, { status: 500 });
  }

  const path = `${admin.companyId}/${employeeId}/profile.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, await photo.arrayBuffer(), { contentType: photo.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: "Could not upload this photo." }, { status: 500 });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const profilePhotoUrl = `${data.publicUrl}?v=${Date.now()}`;
  await db
    .update(users)
    .set({ profilePhotoUrl, updatedAt: new Date() })
    .where(and(eq(users.id, employeeId), eq(users.companyId, admin.companyId)));

  return NextResponse.json({ profilePhotoUrl });
}
