import Link from "next/link";
import SettingsNav from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Control room</p>
          <h1 className="page-title mt-2">Settings</h1>
          <p className="page-subtitle">
            Configure how ServiceSpark represents your company and runs daily operations.
          </p>
        </div>
        <Link href="/dashboard" className="co-button-secondary">
          Back to dashboard
        </Link>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
