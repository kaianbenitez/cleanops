"use client";

import { usePathname } from "next/navigation";

export default function AppContentFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCalendar = pathname.startsWith("/calendar");

  return <div className={isCalendar ? "w-full" : "mx-auto w-full max-w-[1440px]"}>{children}</div>;
}
