import { sql } from "drizzle-orm";
import { invoices } from "@/db/schema";

export const OVERDUE_DAYS = 14;

export function isOverdue(status: string, createdAt: Date | string) {
  return status === "sent" && Date.now() - new Date(createdAt).getTime() > OVERDUE_DAYS * 24 * 60 * 60 * 1000;
}

export function overdueSqlCondition() {
  return sql`${invoices.status} = 'sent' and ${invoices.createdAt} < now() - interval '${sql.raw(String(OVERDUE_DAYS))} days'`;
}
