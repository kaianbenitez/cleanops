import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { getCompanyGoogleMapsApiKey } from "@/lib/settings/integrations";

export async function GET() {
  const admin = await requireAdmin();
  const apiKey = await getCompanyGoogleMapsApiKey(admin.companyId);
  // A Maps browser key must be delivered to the authenticated browser to load
  // Maps; it is never included in the general settings response.
  return NextResponse.json({ apiKey });
}
