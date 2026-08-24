import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFieldEligible, isHybridEmployee } from "@/lib/auth/field-staff";
import { emailToUsername } from "@/lib/auth/username";
import { db } from "@/db";
import { appNotifications, users } from "@/db/schema";
import { toISODate } from "@/lib/scheduling/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import AppNav from "./app-nav";
import ActionFeedbackProvider from "./action-feedback-provider";
import AppSurfaceMotion from "./app-surface-motion";
import AppContentFrame from "./app-content-frame";
import CreateMenu from "./create-menu";
import GlobalSearch from "./global-search";
import InstallHintBanner from "./install-hint-banner";
import MustChangePassword from "./must-change-password";
import NotificationsMenu from "./notifications-menu";
import ThemeProvider from "./theme-provider";
import ThemeToggle from "./theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.role === "admin";
  const profilePhotoPath = user.profilePhotoUrl;
  const profilePhotoUrl = profilePhotoPath
    ? ((await createAdminClient().storage.from("employee-photos").createSignedUrl(profilePhotoPath, 60 * 60)).data?.signedUrl ?? null)
    : null;
  const initialNotifications = isAdmin
    ? await db.select({ id: appNotifications.id, title: appNotifications.title, body: appNotifications.body, href: appNotifications.href, readAt: appNotifications.readAt, createdAt: appNotifications.createdAt }).from(appNotifications).where(eq(appNotifications.companyId, user.companyId)).orderBy(desc(appNotifications.createdAt)).limit(20)
    : [];
  // "Internal meeting" / "Block time" (PTO, sick leave, personal appointments)
  // in the Create menu needs a field-staff roster to attend the appointment.
  // The default date is just the panel's starting value — editable there.
  const staffRoster = isAdmin
    ? await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(and(eq(users.companyId, user.companyId), eq(users.isActive, true), isFieldEligible))
        .orderBy(users.firstName, users.lastName)
    : [];
  const appointmentDefaultDate = toISODate(new Date());

  return (
    <ActionFeedbackProvider>
      <ThemeProvider className="min-h-[100dvh] bg-[var(--co-bg)] text-[var(--co-ink)]">
        <InstallHintBanner />
        {user.mustChangePassword ? (
          <main className="w-full px-3 py-4 sm:px-4 lg:px-5 xl:px-6 lg:py-5">
            <MustChangePassword />
          </main>
        ) : (
          <>
            <AppNav
              isAdmin={isAdmin}
              isFieldStaff={isHybridEmployee(user)}
              userName={`${user.firstName} ${user.lastName}`}
              userEmail={emailToUsername(user.email)}
              profilePhotoUrl={profilePhotoUrl}
              initialNotifications={initialNotifications}
              staffRoster={staffRoster}
              appointmentDefaultDate={appointmentDefaultDate}
            />
            <div data-app-frame className="transition-[padding] duration-200 xl:pl-[var(--app-nav-width)]">
              <header data-app-topbar className="sticky top-0 z-40 hidden border-b border-[var(--co-line-soft)] bg-[var(--co-surface)]/90 backdrop-blur-xl xl:block">
                <div className="flex h-[64px] items-center justify-end px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center justify-end gap-3">
                    {isAdmin ? <GlobalSearch /> : null}
                    <ThemeToggle />
                    {isAdmin ? <NotificationsMenu initialNotifications={initialNotifications} /> : null}
                    {isAdmin ? <CreateMenu appointments={{ staffRoster, defaultDate: appointmentDefaultDate }} /> : null}
                  </div>
                </div>
              </header>
              <main
                className={`w-full px-3 py-4 sm:px-4 lg:px-5 xl:px-6 lg:py-5 ${isAdmin ? "" : "pb-[calc(88px+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] xl:pb-5"}`}
              >
                <AppContentFrame>
                  <AppSurfaceMotion>{children}</AppSurfaceMotion>
                </AppContentFrame>
              </main>
            </div>
          </>
        )}
      </ThemeProvider>
    </ActionFeedbackProvider>
  );
}
