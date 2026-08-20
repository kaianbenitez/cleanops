import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { emailToUsername } from "@/lib/auth/username";
import PasswordForm from "./password-form";
import SessionStatus from "./session-status";
import InstallGuidance from "./install-guidance";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const username = emailToUsername(user.email);

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <p className="eyebrow">My account</p>
        <h1 className="page-title mt-2">Account</h1>
      </div>

      <section className="co-card space-y-3 p-5">
        <div>
          <p className="type-field-body font-semibold text-[var(--co-ink)]">
            Signed in as {user.firstName} {user.lastName}
          </p>
          <p className="type-field-meta text-[var(--co-muted)]">{username}</p>
        </div>
        <SessionStatus />
      </section>

      <section className="co-card space-y-2 p-5">
        <p className="type-field-body font-semibold text-[var(--co-ink)]">Stay signed in on this phone</p>
        <p className="type-field-meta text-[var(--co-muted)]">
          Only use this on a phone that&apos;s yours. On a shared phone, sign out when you&apos;re done so nobody else can open your day.
        </p>
      </section>

      <section className="co-card p-5">
        <p className="type-field-body font-semibold text-[var(--co-ink)]">Install Shimmer</p>
        <div className="mt-2">
          <InstallGuidance />
        </div>
      </section>

      <div>
        <p className="page-title mt-2 text-lg">Change password</p>
        <p className="page-subtitle">Update the password for your own Shimmer login.</p>
      </div>
      <PasswordForm />
    </div>
  );
}
