import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function PrivacyPolicyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <p className="eyebrow">Legal</p>
        <h1 className="page-title mt-2">Privacy Policy</h1>
        <p className="page-subtitle">This page is a placeholder.</p>
      </div>

      <div className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <p>
          A privacy policy for CleanOps hasn&apos;t been published yet. Replace this page with your company&apos;s actual
          policy covering what data is collected (job, customer, and payroll records), how it&apos;s stored, and who can
          access it.
        </p>
        <p>Contact your administrator if you have questions about how your information is handled in the meantime.</p>
      </div>
    </div>
  );
}
