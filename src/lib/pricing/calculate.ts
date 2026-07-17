import { db } from "@/db";
import { roomTypeServiceWeights, serviceLocations, travelZones } from "@/db/schema";
import { eq } from "drizzle-orm";

export const SERVICE_TYPES = [
  "supreme_deep",
  "deep",
  "first_time",
  "weekly",
  "biweekly",
  "four_weeks",
  "move_in_out",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export type RoomCount = { roomTypeId: string; count: number };

export type PricingBreakdown = {
  roomLines: Array<{ roomTypeId: string; count: number; weightHours: number; subtotalCents: number }>;
  roomSubtotalCents: number;
  travelZoneId: string | null;
  travelFeeCents: number;
  rawTotalCents: number;
  dirtyCodeLevel: number | null;
  discountPercent: number;
  discountedCents: number;
  minimumCents: number;
  finalCents: number;
  minimumApplied: boolean;
};

/**
 * Computes the price for every service tier from the same room counts —
 * matching the source spreadsheet's real behavior (it computes all 7
 * service-type columns simultaneously from one set of room counts; the
 * admin didn't pre-pick a single tier). Used so the customer-facing quote
 * page can show every option and let the customer choose, like the
 * company's real TCF proposal does.
 */
export async function calculateAllTierPrices(params: {
  serviceLocationId: string;
  roomCounts: RoomCount[];
  travelZoneId: string | null;
  dirtyCodeLevel: number | null;
}): Promise<Record<ServiceType, PricingBreakdown>> {
  const [location] = await db
    .select()
    .from(serviceLocations)
    .where(eq(serviceLocations.id, params.serviceLocationId))
    .limit(1);

  if (!location) {
    throw new Error("Service location not found");
  }

  const roomTypeIds = params.roomCounts.filter((r) => r.count > 0).map((r) => r.roomTypeId);
  const allWeights = roomTypeIds.length
    ? await db.select().from(roomTypeServiceWeights)
    : [];

  let travelFeeCents = 0;
  if (params.travelZoneId) {
    const [zone] = await db
      .select()
      .from(travelZones)
      .where(eq(travelZones.id, params.travelZoneId))
      .limit(1);
    travelFeeCents = zone?.feeCents ?? 0;
  }

  const tiers = (location.dirtyCodeTiers as Array<{ level: number; discountPercent: number }>) ?? [];
  const tier = params.dirtyCodeLevel != null ? tiers.find((t) => t.level === params.dirtyCodeLevel) : undefined;
  const discountPercent = tier?.discountPercent ?? 0;
  const minimums = (location.minimums as Record<string, number>) ?? {};

  const result = {} as Record<ServiceType, PricingBreakdown>;

  for (const serviceType of SERVICE_TYPES) {
    const weightByRoomType = new Map(
      allWeights.filter((w) => w.serviceType === serviceType).map((w) => [w.roomTypeId, parseFloat(w.weightHours)])
    );

    const roomLines = params.roomCounts
      .filter((r) => r.count > 0)
      .map((r) => {
        const weightHours = weightByRoomType.get(r.roomTypeId) ?? 0;
        const subtotalCents = Math.round(weightHours * location.hourlyRateCents * r.count);
        return { roomTypeId: r.roomTypeId, count: r.count, weightHours, subtotalCents };
      });

    const roomSubtotalCents = roomLines.reduce((sum, l) => sum + l.subtotalCents, 0);
    const rawTotalCents = roomSubtotalCents + travelFeeCents;
    const discountedCents = Math.round(rawTotalCents * (1 + discountPercent));
    const minimumCents = minimums[serviceType] ?? 0;
    const finalCents = Math.max(discountedCents, minimumCents);

    result[serviceType] = {
      roomLines,
      roomSubtotalCents,
      travelZoneId: params.travelZoneId,
      travelFeeCents,
      rawTotalCents,
      dirtyCodeLevel: params.dirtyCodeLevel,
      discountPercent,
      discountedCents,
      minimumCents,
      finalCents,
      minimumApplied: finalCents === minimumCents && discountedCents < minimumCents,
    };
  }

  return result;
}
