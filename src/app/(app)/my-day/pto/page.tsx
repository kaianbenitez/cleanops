import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import PtoRequests from "../pto-requests";

export default async function MyDayPtoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-[560px] space-y-4 pb-10">
      <Link href="/my-day" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--co-evergreen)]">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to My Day
      </Link>
      <PtoRequests />
    </div>
  );
}
