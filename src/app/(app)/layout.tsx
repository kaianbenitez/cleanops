import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { emailToUsername } from "@/lib/auth/username";
import AppNav from "./app-nav";
import ActionFeedbackProvider from "./action-feedback-provider";
import AppSurfaceMotion from "./app-surface-motion";
import CreateMenu from "./create-menu";
import GlobalSearch from "./global-search";
import MustChangePassword from "./must-change-password";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.role === "admin";

  return (
    <ActionFeedbackProvider>
      <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(0,108,73,0.06),transparent_26%),radial-gradient(circle_at_top_right,rgba(0,108,73,0.04),transparent_18%),var(--co-bg)] text-[var(--co-ink)]">
        {user.mustChangePassword ? (
          <main className="w-full px-3 py-4 sm:px-4 lg:px-5 xl:px-6 lg:py-5">
            <MustChangePassword />
          </main>
        ) : (
          <>
            <AppNav isAdmin={isAdmin} isFieldStaff={user.isFieldStaff} userName={`${user.firstName} ${user.lastName}`} userEmail={emailToUsername(user.email)} />
            <div className="lg:pl-[260px]">
              <header className="sticky top-0 z-20 hidden border-b border-[var(--co-line-soft)] bg-[var(--co-surface)]/90 backdrop-blur-xl xl:block">
                <div className="flex h-[64px] items-center justify-end px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center justify-end gap-3">
                    {isAdmin ? <GlobalSearch /> : null}
                    {isAdmin ? <CreateMenu /> : null}
                  </div>
                </div>
              </header>
              <main className="w-full px-3 py-4 sm:px-4 lg:px-5 xl:px-6 lg:py-5">
                <AppSurfaceMotion>{children}</AppSurfaceMotion>
              </main>
            </div>
          </>
        )}
      </div>
    </ActionFeedbackProvider>
  );
}
