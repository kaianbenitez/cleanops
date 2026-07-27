import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

const bucket = "quote-assets";
const maxBytes = 5 * 1024 * 1024;
const extensionByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const documentTypes = new Set([...imageTypes, "application/pdf"]);

/** Confirms the file's actual bytes match its declared MIME type, so a
 * relabeled/spoofed upload can't slip past the `accept` attribute — which is
 * client-side only and trivially bypassed. */
function sniffedTypeMatches(bytes: Uint8Array, declaredType: string) {
  const header = Array.from(bytes.subarray(0, 12));
  switch (declaredType) {
    case "image/jpeg":
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => header[index] === byte);
    case "image/webp":
      return (
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
        header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
      );
    case "application/pdf":
      return header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();

  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "document" ? "document" : "image";
  const allowedTypes = kind === "document" ? documentTypes : imageTypes;

  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size === 0 || file.size > maxBytes) {
    return NextResponse.json(
      { error: kind === "document" ? "Upload a JPG, PNG, WebP, or PDF up to 5 MB." : "Upload a JPG, PNG, or WebP image up to 5 MB." },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffedTypeMatches(bytes, file.type)) {
    return NextResponse.json({ error: "That file doesn't look like a valid " + file.type.split("/")[1].toUpperCase() + "." }, { status: 400 });
  }

  const path = `${admin.companyId}/${crypto.randomUUID()}.${extensionByType[file.type]}`;
  const storage = createAdminClient().storage.from(bucket);
  const { error: uploadError } = await storage.upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data } = storage.getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
