import { eq } from "drizzle-orm";
import { Phone } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function HelpCenterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const company = await db
    .select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const branding = ((company?.settings as { branding?: { phone?: string | null } } | null)?.branding ?? null) as { phone?: string | null } | null;
  const officePhone = branding?.phone ?? null;

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <p className="eyebrow">Support</p>
        <h1 className="page-title mt-2">Help Center</h1>
        <p className="page-subtitle">Need a hand? Reach out to the office directly.</p>
      </div>

      <div className="co-card space-y-4 p-5">
        {officePhone ? (
          <a href={`tel:${officePhone}`} className="co-button-primary justify-center gap-1.5">
            <Phone className="h-4 w-4" aria-hidden />
            Call the office · {officePhone}
          </a>
        ) : (
          <p className="text-sm text-[var(--co-muted)]">No office phone number is on file yet. Contact your administrator.</p>
        )}
        <p className="text-sm leading-6 text-[var(--co-muted)]">
          For anything urgent while you&apos;re on a job — access issues, schedule changes, or a customer question — call the office and someone will help right away.
        </p>
      </div>
    </div>
  );
}
