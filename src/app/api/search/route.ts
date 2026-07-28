import { and, eq, ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, invoices, quotes, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFieldEligible } from "@/lib/auth/field-staff";

export async function GET(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ results: [] }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ results: [] });

  const term = `%${query}%`;
  const customerFullName = sql`concat_ws(' ', ${customers.firstName}, ${customers.lastName})`;
  const employeeFullName = sql`concat_ws(' ', ${users.firstName}, ${users.lastName})`;
  const customerSearch = or(
    ilike(customerFullName, term),
    ilike(customers.firstName, term),
    ilike(customers.lastName, term),
    ilike(customers.companyName, term),
    ilike(customers.addressLine1, term),
    ilike(customers.city, term),
    ilike(customers.state, term),
    ilike(customers.zip, term),
    ilike(customers.email, term),
    ilike(customers.phone, term),
  );

  const [customerRows, invoiceRows, quoteRows, employeeRows] = await Promise.all([
    db.select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, companyName: customers.companyName, email: customers.email, phone: customers.phone, addressLine1: customers.addressLine1, city: customers.city, state: customers.state, zip: customers.zip }).from(customers).where(and(eq(customers.companyId, admin.companyId), customerSearch)).limit(5),
    db.select({ id: invoices.id, customerId: customers.id, firstName: customers.firstName, lastName: customers.lastName, companyName: customers.companyName, email: customers.email, phone: customers.phone, addressLine1: customers.addressLine1, city: customers.city, state: customers.state, zip: customers.zip, squareInvoiceId: invoices.squareInvoiceId }).from(invoices).innerJoin(customers, eq(invoices.customerId, customers.id)).where(and(eq(invoices.companyId, admin.companyId), or(customerSearch, ilike(sql`${invoices.id}::text`, term), ilike(invoices.squareInvoiceId, term)))).limit(5),
    db.select({ id: quotes.id, customerId: customers.id, firstName: customers.firstName, lastName: customers.lastName, companyName: customers.companyName, email: customers.email, phone: customers.phone, addressLine1: customers.addressLine1, city: customers.city, state: customers.state, zip: customers.zip, publicToken: quotes.publicToken }).from(quotes).innerJoin(customers, eq(quotes.customerId, customers.id)).where(and(eq(quotes.companyId, admin.companyId), or(customerSearch, ilike(sql`${quotes.id}::text`, term), ilike(quotes.publicToken, term)))).limit(5),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, title: users.title, phone: users.phone, email: users.contactEmail }).from(users).where(and(eq(users.companyId, admin.companyId), isFieldEligible, or(ilike(employeeFullName, term), ilike(users.firstName, term), ilike(users.lastName, term), ilike(users.title, term), ilike(users.phone, term), ilike(users.contactEmail, term)))).limit(5),
  ]);

  const customerMeta = (row: { addressLine1: string | null; city: string | null; state: string | null; zip: string | null; email: string | null; phone: string | null }) => [
    [row.addressLine1, [row.city, row.state, row.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    row.email,
    row.phone,
  ].filter(Boolean);

  return NextResponse.json({
    results: [
      ...customerRows.map((row) => ({ id: row.id, kind: "Customer profile", title: row.companyName || `${row.firstName} ${row.lastName}`, subtitle: "Customer profile", meta: customerMeta(row), href: `/customers/${row.id}` })),
      ...invoiceRows.map((row) => ({ id: row.id, kind: "Invoice", title: `Invoice #${row.squareInvoiceId || row.id.slice(0, 8)}`, subtitle: row.companyName || `${row.firstName} ${row.lastName}`, meta: customerMeta(row), href: `/invoices/${row.id}` })),
      ...quoteRows.map((row) => ({ id: row.id, kind: "Quote", title: `Quote #${row.id.slice(0, 8)}`, subtitle: row.companyName || `${row.firstName} ${row.lastName}`, meta: customerMeta(row), href: `/quotes/${row.id}` })),
      ...employeeRows.map((row) => ({ id: row.id, kind: "Employee", title: `${row.firstName} ${row.lastName}`, subtitle: row.title || "Employee", meta: [row.email, row.phone].filter(Boolean), href: `/employees/${row.id}` })),
    ],
  });
}
