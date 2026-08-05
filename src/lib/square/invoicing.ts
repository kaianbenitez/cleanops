import { db } from "@/db";
import { customers, invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { upsertSquareCustomer, createAndPublishInvoice } from "./client";
import { getCompanySquareConfig } from "@/lib/settings/integrations";

/**
 * Creates and publishes a Square invoice for a CleanOps invoice record:
 * resolves the customer's Square customer id (creating and persisting it on
 * first send, same pattern as customers.ghlContactId), then creates and
 * publishes the actual invoice, and updates our row with the resulting
 * squareInvoiceId + status.
 */
export async function sendInvoiceViaSquare(invoiceId: string, companyId: string): Promise<{ ok: boolean; error?: string }> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) return { ok: false, error: "Invoice not found" };
  if (invoice.companyId !== companyId) return { ok: false, error: "Invoice not found" };

  const [customer] = await db.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1);
  if (!customer) return { ok: false, error: "Customer not found" };

  let squareCustomerId = customer.squareCustomerId;
  if (!squareCustomerId) {
    const squareConfig = await getCompanySquareConfig(companyId);
    const customerRes = await upsertSquareCustomer(squareConfig, {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
    });
    if (!customerRes.ok) return { ok: false, error: "Square customer upsert failed" };

    const customerBody = customerRes.body as { customer?: { id?: string }; mock?: boolean };
    squareCustomerId = customerBody.mock ? `mock-cust-${customer.id}` : (customerBody.customer?.id ?? null);
    if (!squareCustomerId) return { ok: false, error: "No Square customer id returned" };

    await db.update(customers).set({ squareCustomerId }).where(eq(customers.id, customer.id));
  }

  const squareConfig = await getCompanySquareConfig(companyId);
  const invoiceRes = await createAndPublishInvoice(squareConfig, {
    squareCustomerId,
    locationId: squareConfig.locationId,
    title: `Invoice for ${customer.firstName} ${customer.lastName}`,
    totalCents: invoice.totalCents,
    idempotencyKey: invoice.id,
  });

  if (!invoiceRes.ok || !invoiceRes.invoiceId) {
    return { ok: false, error: "Square invoice creation failed" };
  }

  await db
    .update(invoices)
    .set({ status: "sent", method: "square", squareInvoiceId: invoiceRes.invoiceId })
    .where(eq(invoices.id, invoiceId));

  return { ok: true };
}
