import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { getGhlLocation } from "@/lib/ghl/client";

export async function GET() {
  const admin = await requireAdmin();
  const locationId = process.env.GHL_LOCATION_ID ?? "";

  if (!process.env.GHL_API_KEY) {
    return NextResponse.json({
      ok: false,
      reason: "GHL_API_KEY is not configured",
      mockMode: true,
    });
  }

  if (!locationId) {
    return NextResponse.json({
      ok: false,
      reason: "GHL_LOCATION_ID is not configured",
    });
  }

  const response = await getGhlLocation(locationId);
  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: response.status,
        reason: "Could not reach GHL with the configured API key and location ID.",
        body: response.body,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    companyId: admin.companyId,
    status: response.status,
    body: response.body,
  });
}
