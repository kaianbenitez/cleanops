import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { productLeads } from "@/db/schema";

const leadSchema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name.").max(200),
  contactName: z.string().trim().max(200).nullish().transform((value) => value || null),
  email: z.string().trim().email("Enter a valid email address.").max(320),
  phone: z.string().trim().max(50).nullish().transform((value) => value || null),
  crewSize: z.enum(["1-5", "6-15", "16+"]).nullable(),
  message: z.string().trim().max(2_000).nullable(),
  companyWebsite: z.string().optional(),
});

export async function POST(request: Request) {
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
