import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { productLeads } from "@/db/schema";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestsByIp = new Map<string, number[]>();

const leadSchema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name.").max(200),
  contactName: z.string().trim().max(200).nullish().transform((value) => value || null),
  email: z.string().trim().email("Enter a valid email address.").max(320),
  phone: z.string().trim().max(50).nullish().transform((value) => value || null),
  crewSize: z.enum(["1-5", "6-15", "16+"]).nullish().transform((value) => value || null),
  message: z.string().trim().max(2_000).nullish().transform((value) => value || null),
  companyWebsite: z.string().optional(),
  turnstileToken: z.string().nullish(),
});

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  requestsByIp.set(ip, recent);
  return recent.length > MAX_REQUESTS;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": "600" } });
  }

  const body = await request.json().catch(() => null);
  const parsed = leadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.companyWebsite) {
    return NextResponse.json({ ok: true });
  }

  const turnstileSecret = process.env.LEADS_TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    if (!parsed.data.turnstileToken) {
      return NextResponse.json({ error: "Complete the verification challenge and try again." }, { status: 400 });
    }
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: turnstileSecret, response: parsed.data.turnstileToken, remoteip: ip }),
    }).then((response) => response.json() as Promise<{ success?: boolean }>).catch(() => ({ success: false }));
    if (!verification.success) {
      return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
    }
  }

  await db.insert(productLeads).values({
    businessName: parsed.data.businessName,
    contactName: parsed.data.contactName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    crewSize: parsed.data.crewSize,
    message: parsed.data.message,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
