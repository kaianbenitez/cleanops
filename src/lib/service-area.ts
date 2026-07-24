import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { customers, customerLocations, serviceLocations, travelZones } from "@/db/schema";

export type ServiceAreaStatus = "in_area" | "outside_area" | "missing_address" | "no_service_zones";

export type ServiceAreaSummary = {
  status: ServiceAreaStatus;
  label: string;
  detail: string;
  matchedServiceLocationName?: string | null;
  matchedZoneName?: string | null;
  addressLabel?: string | null;
};

type AddressLike = {
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  subdivision?: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function cityCandidates(address: AddressLike) {
  return [address.city, address.subdivision, address.addressLine1]
    .map((value) => normalize(value))
    .filter(Boolean);
}

function zipCandidates(address: AddressLike) {
  const raw = (address.zip ?? "").trim();
  const cleaned = raw.replace(/[^\d]/g, "");
  return [raw, cleaned.slice(0, 5), cleaned].map((value) => normalize(value)).filter(Boolean);
}

function zoneTokens(zoneName: string) {
  return zoneName
    .split(/[,&/|;]+/g)
    .flatMap((part) => part.split(/\s+-\s+/g))
    .map((part) => normalize(part))
    .filter(Boolean);
}

function matchesZone(zoneName: string, address: AddressLike) {
  const tokens = zoneTokens(zoneName);
  const citySet = new Set(cityCandidates(address));
  const zipSet = new Set(zipCandidates(address));
  for (const token of tokens) {
    if (citySet.has(token) || zipSet.has(token)) return true;
  }
  return false;
}

async function loadPrimaryAddress(companyId: string, customerId: string): Promise<AddressLike & { addressLabel: string }> {
  const [customer] = await db
    .select({
      addressLine1: customers.addressLine1,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
      subdivision: customers.subdivision,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId)))
    .limit(1);

  const locations = await db
    .select({
      addressLine1: customerLocations.addressLine1,
      city: customerLocations.city,
      state: customerLocations.state,
      zip: customerLocations.zip,
      subdivision: customerLocations.subdivision,
      isPrimary: customerLocations.isPrimary,
    })
    .from(customerLocations)
    .where(and(eq(customerLocations.customerId, customerId), eq(customerLocations.companyId, companyId)))
    .orderBy(desc(customerLocations.isPrimary), asc(customerLocations.createdAt));

  const primary = locations[0] ?? null;
  const source = primary ?? customer ?? null;

  return {
    addressLine1: source?.addressLine1 ?? null,
    city: source?.city ?? null,
    state: source?.state ?? null,
    zip: source?.zip ?? null,
    subdivision: source?.subdivision ?? null,
    addressLabel:
      [source?.addressLine1, source?.city, source?.state, source?.zip].filter(Boolean).join(", ") ||
      [source?.city, source?.state, source?.zip].filter(Boolean).join(", ") ||
      "Address not recorded",
  };
}

export async function resolveAddressServiceArea(params: {
  companyId: string;
  address: AddressLike & { addressLabel?: string | null };
  serviceLocationId?: string | null;
}): Promise<ServiceAreaSummary> {
  const { address } = params;
  const addressLabel = address.addressLabel ?? ([address.addressLine1, address.city, address.state, address.zip].filter(Boolean).join(", ") || "Address not recorded");
  const hasAddress = Boolean(address.city || address.zip || address.addressLine1 || address.subdivision);
  if (!hasAddress) {
    return { status: "missing_address", label: "Address needed", detail: "Add city or ZIP to check whether this customer is inside your service area.", addressLabel };
  }

  const locationRows = params.serviceLocationId
    ? await db.select({ id: serviceLocations.id, name: serviceLocations.name }).from(serviceLocations).where(and(eq(serviceLocations.id, params.serviceLocationId), eq(serviceLocations.companyId, params.companyId), eq(serviceLocations.isActive, true))).limit(1)
    : await db.select({ id: serviceLocations.id, name: serviceLocations.name }).from(serviceLocations).where(and(eq(serviceLocations.companyId, params.companyId), eq(serviceLocations.isActive, true))).orderBy(asc(serviceLocations.name));
  if (locationRows.length === 0) return { status: "no_service_zones", label: "No service zones", detail: "Create service area zones before blocking out-of-area quotes.", addressLabel };

  const zoneRows = await db.select({ id: travelZones.id, serviceLocationId: travelZones.serviceLocationId, name: travelZones.name }).from(travelZones).where(inArray(travelZones.serviceLocationId, locationRows.map((row) => row.id))).orderBy(asc(travelZones.sortOrder), asc(travelZones.name));
  if (zoneRows.length === 0) return { status: "no_service_zones", label: "No service zones", detail: "Add towns or ZIP codes under Pricing before blocking out-of-area quotes.", addressLabel };

  for (const location of locationRows) {
    for (const zone of zoneRows.filter((entry) => entry.serviceLocationId === location.id)) {
      if (matchesZone(zone.name, address)) return { status: "in_area", label: "In service area", detail: `${location.name} · ${zone.name}`, matchedServiceLocationName: location.name, matchedZoneName: zone.name, addressLabel };
    }
  }
  return { status: "outside_area", label: "Outside service area", detail: "This address does not match any configured service area zone.", addressLabel };
}

export async function resolveCustomerServiceArea(params: {
  companyId: string;
  customerId: string;
  serviceLocationId?: string | null;
}): Promise<ServiceAreaSummary> {
  const address = await loadPrimaryAddress(params.companyId, params.customerId);
  return resolveAddressServiceArea({ companyId: params.companyId, address, serviceLocationId: params.serviceLocationId });
}
