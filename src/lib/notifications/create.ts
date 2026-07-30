import { db } from "@/db";
import { appNotifications } from "@/db/schema";

/** Inserts an in-app bell notification, visible to every admin in the company. */
export async function notifyAdmins(params: {
  companyId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  customerId?: string | null;
}) {
  await db.insert(appNotifications).values({
    companyId: params.companyId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    href: params.href ?? null,
    customerId: params.customerId ?? null,
  });
}
