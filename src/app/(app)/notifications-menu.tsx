"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type Notification = { id: string; title: string; body: string | null; href: string | null; readAt: Date | string | null; createdAt: Date | string };

function timeAgo(value: Date | string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationsMenu({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const refresh = useCallback(async () => {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const body = await response.json();
    if (Array.isArray(body.notifications)) setNotifications(body.notifications);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markRead(id: string) {
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() } : notification));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  async function markAllRead() {
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  }

  return <div ref={ref} className="relative">
    <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"} className="relative rounded-lg p-2 text-[var(--co-muted)] transition-colors hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]">
      <Bell aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
      {unreadCount ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--co-accent-fill)]" /> : null}
    </button>
    {open ? <div role="menu" aria-label="Notifications" className="absolute right-0 top-full z-30 mt-2 w-96 overflow-hidden rounded-xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] shadow-[0_8px_24px_rgba(18,24,19,0.12)]">
      <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--co-ink)]">Notifications</span>
        {unreadCount ? <button type="button" onClick={markAllRead} className="flex items-center gap-1.5 text-xs font-medium text-[var(--co-accent-text)] hover:underline"><CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />Mark all read</button> : null}
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {notifications.length ? notifications.map((notification) => {
          const content = <><span className="block text-sm font-semibold text-[var(--co-ink)]">{notification.title}</span>{notification.body ? <span className="mt-1 block text-xs leading-5 text-[var(--co-muted)]">{notification.body}</span> : null}<span className="mt-1.5 block text-xs text-[var(--co-faint)]">{timeAgo(notification.createdAt)}</span></>;
          const className = `block border-b border-[var(--co-line-soft)] px-4 py-3 last:border-b-0 ${notification.readAt ? "bg-[var(--co-surface)]" : "bg-[var(--co-accent-tint)]/45"}`;
          return notification.href ? <Link key={notification.id} href={notification.href} role="menuitem" onClick={() => { void markRead(notification.id); setOpen(false); }} className={className}>{content}</Link> : <button key={notification.id} type="button" role="menuitem" onClick={() => void markRead(notification.id)} className={`${className} w-full text-left`}>{content}</button>;
        }) : <p className="px-4 py-8 text-center text-sm text-[var(--co-muted)]">No notifications yet.</p>}
      </div>
    </div> : null}
  </div>;
}
