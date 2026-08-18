import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { productLeads } from "@/db/schema";
import { notifyAdmins } from "@/lib/notifications/create";
import { sendEmail } from "@/lib/email/send";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const requestsByIp = new Map<string, number[]>();

const leadSchema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name.").max(200),
  contactName: z.string().trim().max(200).nullish().transform((value) => value || null),
  email: z.string().trim().email("Enter a valid email address.").max(320),
  phone: z.string().trim().max(50).nullish().transform((value) => value || null),
  crewSize: z.enum(["1-5", "6-15", "16+"]),
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
  const body = await request.json().catch(() => null);
  const parsed = leadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": "600" } });
  }

  if (parsed.data.companyWebsite) {
    return NextResponse.json({ ok: true });
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
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

  const companyId = process.env.GHL_PRIMARY_COMPANY_ID;
  if (companyId) {
    try {
      await notifyAdmins({
        companyId,
        type: "product_lead.received",
        title: `New lead: ${parsed.data.businessName}`,
        body: parsed.data.contactName ?? parsed.data.email,
        href: "/leads",
      });
    } catch (error) {
      console.error("Failed to notify admins of new lead", error);
    }
  }

  const notifyEmail = process.env.LEAD_NOTIFICATION_EMAIL;
  if (notifyEmail) {
    try {
      await sendEmail({
        to: notifyEmail,
        subject: `New lead: ${parsed.data.businessName}`,
        text: [
          `Business: ${parsed.data.businessName}`,
          `Contact: ${parsed.data.contactName ?? "—"}`,
          `Email: ${parsed.data.email}`,
          `Phone: ${parsed.data.phone ?? "—"}`,
          `Crew size: ${parsed.data.crewSize ?? "—"}`,
          `Message: ${parsed.data.message ?? "—"}`,
        ].join("\n"),
      });
    } catch (error) {
      console.error("Failed to email lead notification", error);
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
