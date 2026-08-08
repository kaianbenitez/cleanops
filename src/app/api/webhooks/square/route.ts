import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { webhookEvents, invoices, feedbackRequests } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { verifySquareSignature } from "@/lib/square/client";
import { getSquareWebhookKeys } from "@/lib/settings/integrations";

/**
 * Inbound Square webhook — per PLAN.md §6, listens for `invoice.payment_made`
 * and marks the matching CleanOps invoice paid. Raw payload stored in
 * webhook_events before processing (same pattern as the GHL webhook), so a
 * processing bug never loses the underlying event.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature") ?? "";
  const notificationUrl = req.url;

  const webhookKeys = await getSquareWebhookKeys();
  // Retain today's permissive mock behavior when no webhook key exists at all.
  const signatureValid = webhookKeys.length === 0 || webhookKeys.some((key) => verifySquareSignature(rawBody, signature, notificationUrl, key));

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = { raw: rawBody };
  }

  const [event] = await db
    .insert(webhookEvents)
    .values({ source: "square", payload: payload as object, signatureValid })
    .returning();

  if (!signatureValid) {
    await db
      .update(webhookEvents)
      .set({ error: "Invalid Square webhook signature" })
      .where(eq(webhookEvents.id, event.id));
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = typeof payload === "object" && payload !== null && "event_id" in payload
    ? String((payload as { event_id?: unknown }).event_id ?? "")
    : "";
  if (eventId) {
    const [duplicate] = await db
      .select({ id: webhookEvents.id, processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, "square"), ne(webhookEvents.id, event.id), sql`${webhookEvents.payload}->>'event_id' = ${eventId}`))
      .limit(1);
    if (duplicate) return NextResponse.json({ ok: true, duplicate: true, processedAt: duplicate.processedAt });
  }

  try {
    await processPaymentEvent(payload);
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, event.id));
  }

  return NextResponse.json({ ok: true });
}

type SquareInvoiceEvent = {
  type?: string;
  data?: { object?: { invoice?: { id?: string; status?: string; payment_requests?: Array<{ tip_money?: { amount?: number | string } }> }; payment?: { tip_money?: { amount?: number | string } } } };
};

async function processPaymentEvent(payload: unknown): Promise<void> {
  const p = payload as SquareInvoiceEvent;
  if (p.type !== "invoice.payment_made" && p.type !== "invoice.updated") return;

  const squareInvoiceId = p.data?.object?.invoice?.id;
  const status = p.data?.object?.invoice?.status;
  if (!squareInvoiceId) throw new Error("Payload missing invoice id");
  if (status !== "PAID") return; // only act on the actually-paid transition

  const [invoice] = await db
    .select({ id: invoices.id, jobId: invoices.jobId })
    .from(invoices)
    .where(eq(invoices.squareInvoiceId, squareInvoiceId))
    .limit(1);

  if (!invoice) throw new Error(`No invoice found for Square invoice ${squareInvoiceId}`);

  const invoiceObject = p.data?.object?.invoice;
  const paymentObject = p.data?.object?.payment;
  const tipCents = Number(paymentObject?.tip_money?.amount ?? invoiceObject?.payment_requests?.reduce((sum, request) => sum + Number(request.tip_money?.amount ?? 0), 0) ?? 0);
  await db.update(invoices).set({ status: "paid", paidAt: new Date(), ...(tipCents > 0 ? { tipCents } : {}) }).where(eq(invoices.id, invoice.id));
  if (invoice.jobId && tipCents > 0) {
    await db.update(feedbackRequests).set({ tipCents }).where(eq(feedbackRequests.jobId, invoice.jobId));
  }
}
