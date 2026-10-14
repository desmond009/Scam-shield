"use client";

import { Activity, Bell, Brain, FlaskConical, LogOut, Send, Shield, SlidersHorizontal, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useLogout, useMe } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

const NAV: { href: string; label: string; icon: typeof Wallet; roles: Role[] }[] = [
  { href: "/wallet", label: "Wallet", icon: Wallet, roles: ["USER", "ANALYST", "ADMIN"] },
  { href: "/send", label: "Send money", icon: Send, roles: ["USER", "ANALYST", "ADMIN"] },
  { href: "/safety", label: "My safety", icon: Shield, roles: ["USER", "ANALYST", "ADMIN"] },
  { href: "/analyst", label: "Alerts", icon: Bell, roles: ["ANALYST", "ADMIN"] },
  { href: "/admin/simulator", label: "Simulator", icon: FlaskConical, roles: ["ADMIN"] },
  { href: "/admin/rules", label: "Rules", icon: SlidersHorizontal, roles: ["ADMIN"] },
  { href: "/admin/model", label: "Model", icon: Brain, roles: ["ADMIN"] },
  { href: "/admin/health", label: "Health", icon: Activity, roles: ["ADMIN"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();

  useEffect(() => {
    if (!isLoading && !me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, me, router, pathname]);

  if (isLoading || !me) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const links = NAV.filter((n) => n.roles.includes(me.role));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/wallet" aria-label="ScamShield home">
            <Logo />
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {links.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  pathname.startsWith(n.href) && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
                )}
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium">{me.name}</span>
              <span className="text-muted-foreground">{me.role.toLowerCase()}</span>
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
            >
              <LogOut />
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Main mobile">
          {links.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1 text-xs",
                pathname.startsWith(n.href) && "border-primary bg-primary-soft text-primary",
              )}
            >
              <n.icon className="size-3.5" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Client-side role gate for pages; the API enforces the same roles server-side. */
export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: me } = useMe();
  if (!me) return null;
  if (me.role !== "ADMIN" && !roles.includes(me.role)) {
    return <p className="py-20 text-center text-muted-foreground">You don&apos;t have access to this page.</p>;
  }
  return <>{children}</>;
}
