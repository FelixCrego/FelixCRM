"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Bot,
  Briefcase,
  Command,
  Flame,
  LayoutDashboard,
  Search,
  Sparkles,
  Wallet,
  X,
  Users,
  Shield,
  Radar,
  Banknote,
  ScrollText,
  Trophy,
  Map as MapIcon,
  Gauge,
  CalendarDays,
  CircleDollarSign,
  Menu,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRole } from "@/components/role-context";
import type { UserRole } from "@/lib/types";

type PlaybookCard = {
  title: string;
  body: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type MagicSuggestion = {
  id: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
};

const roleOptions: UserRole[] = ["REP", "TEAM_LEAD", "MANAGER", "SUPER_ADMIN"];

const navByRole: Record<UserRole, NavItem[]> = {
  REP: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/scrape", label: "Scrape Leads", icon: Search },
    { href: "/leads", label: "My Leads", icon: Users },
    { href: "/closed-deals", label: "Closed Deals", icon: CircleDollarSign },
    { href: "/pipeline", label: "Pipeline", icon: Flame },
    { href: "/demos", label: "Upcoming Demos", icon: CalendarDays },
    { href: "/training", label: "Training Center", icon: Bot },
    { href: "/commissions", label: "Commissions", icon: Wallet },
  ],
  TEAM_LEAD: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/scrape", label: "Scrape Leads", icon: Search },
    { href: "/leads", label: "My Leads", icon: Users },
    { href: "/closed-deals", label: "Closed Deals", icon: CircleDollarSign },
    { href: "/pipeline", label: "Pipeline", icon: Flame },
    { href: "/demos", label: "Upcoming Demos", icon: CalendarDays },
    { href: "/training", label: "Training Center", icon: Bot },
    { href: "/commissions", label: "Commissions", icon: Wallet },
    { href: "/team-overview", label: "Team Overview", icon: Trophy },
  ],
  MANAGER: [
    { href: "/dashboard", label: "Manager Dashboard", icon: Gauge },
    { href: "/territory-setup", label: "Territory Setup", icon: MapIcon },
    { href: "/rep-performance", label: "Rep Performance", icon: Trophy },
    { href: "/payouts", label: "Payouts", icon: Briefcase },
  ],
  SUPER_ADMIN: [
    { href: "/dashboard", label: "Global Command Center", icon: Shield },
    { href: "/billing", label: "Billing/Stripe", icon: Banknote },
    { href: "/user-management", label: "User Management", icon: Users },
    { href: "/system-logs", label: "System Logs", icon: ScrollText },
  ],
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeRole, setActiveRole } = useRole();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [magicBarValue, setMagicBarValue] = useState("");
  const [magicBarStatus, setMagicBarStatus] = useState("");
  const [isGeneratingPlaybook, setIsGeneratingPlaybook] = useState(false);
  const [playbookCards, setPlaybookCards] = useState<PlaybookCard[]>([
    { title: "Cold Openers", body: "Generate role-aware scripts and send sequences aligned to your current pipeline stage." },
    { title: "Objection Handling", body: "Generate role-aware scripts and send sequences aligned to your current pipeline stage." },
    { title: "Close-Ready Follow Ups", body: "Generate role-aware scripts and send sequences aligned to your current pipeline stage." },
  ]);

  const generatePlaybook = async () => {
    setIsGeneratingPlaybook(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setPlaybookCards([
      {
        title: "Cold Openers",
        body: "Lead with a 20-second value hook: time-to-launch, expected lead gain, and one quick win specific to their business type.",
      },
      {
        title: "Objection Handling",
        body: "When budget comes up, anchor to one extra closed customer per month and position rollout as a phased conversion upgrade.",
      },
      {
        title: "Close-Ready Follow Ups",
        body: "Send a same-day recap with demo link, clear CTA to book, and a 48-hour urgency window to keep momentum high.",
      },
    ]);
    setIsGeneratingPlaybook(false);
  };

  const navTargets = useMemo(() => {
    const allNavItems = Object.values(navByRole).flat();
    const dedupedByHref = new Map(allNavItems.map((item) => [item.href, item]));
    return Array.from(dedupedByHref.values());
  }, []);

  const suggestions = useMemo<MagicSuggestion[]>(() => {
    const normalized = magicBarValue.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const items: MagicSuggestion[] = [];

    if (normalized.startsWith("/")) {
      items.push({
        id: `path-${normalized}`,
        label: `Go to ${normalized}`,
        hint: "Direct route",
        run: () => router.push(normalized),
      });
    }

    if ("playbook".includes(normalized) || normalized.includes("playbook")) {
      items.push({
        id: "playbook",
        label: "Open AI Playbook",
        hint: "Quick action",
        run: () => setDrawerOpen(true),
      });
    }

    if (["logout", "log out", "sign out"].some((command) => command.includes(normalized) || normalized.includes(command))) {
      items.push({
        id: "logout",
        label: "Sign out",
        hint: "Quick action",
        run: async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        },
      });
    }

    navTargets.forEach((item) => {
      const itemLabel = item.label.toLowerCase();
      const itemPath = item.href.replace("/", "").replaceAll("-", " ").toLowerCase();
      if (itemLabel.includes(normalized) || itemPath.includes(normalized)) {
        items.push({
          id: item.href,
          label: item.label,
          hint: item.href,
          run: () => router.push(item.href),
        });
      }
    });

    const deduped = new Map(items.map((item) => [item.id, item]));
    return Array.from(deduped.values()).slice(0, 6);
  }, [magicBarValue, navTargets, router]);

  const runSuggestion = async (suggestion: MagicSuggestion) => {
    await suggestion.run();
    setMagicBarStatus(`Ran: ${suggestion.label}`);
  };

  const executeMagicBarCommand = async () => {
    if (suggestions.length === 0) {
      setMagicBarStatus("No matching command.");
      return;
    }

    await runSuggestion(suggestions[0]);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-zinc-800/90 bg-zinc-950/90 px-4 py-6 lg:block">
          <div className="mb-8 flex items-center gap-3 px-3">
            <div className="rounded-xl bg-blue-500/20 p-2 text-blue-300">
              <Command className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Felix</p>
              <h1 className="text-lg font-semibold">CRM OS</h1>
            </div>
          </div>

          <div className="mb-3 px-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-200">
              <Radar className="h-3.5 w-3.5" />
              {activeRole.replace("_", " ")}
            </span>
          </div>

          <div className="mb-6">
            <p className="mb-2 px-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Workspace</p>
            <div className="space-y-1">
              {navByRole[activeRole].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                      active
                        ? "bg-zinc-800 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-700 hover:text-zinc-100 lg:hidden"
              >
                <Menu className="h-4 w-4" />
                Menu
              </button>
              <div className="relative flex-1">
                <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-zinc-400">
                  <Sparkles className="h-4 w-4 text-blue-300" />
                  <input
                    aria-label="Magic Bar"
                    placeholder="Magic Bar: find leads, notes, or command workflows"
                    value={magicBarValue}
                    onChange={(event) => {
                      setMagicBarValue(event.target.value);
                      setMagicBarStatus("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void executeMagicBarCommand();
                      }
                    }}
                    className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                </div>
                {magicBarValue.trim() ? (
                  <div className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl">
                    {suggestions.length > 0 ? (
                      <div className="space-y-1">
                        {suggestions.map((suggestion, index) => (
                          <button
                            key={suggestion.id}
                            onClick={() => void runSuggestion(suggestion)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                              index === 0 ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800/70",
                            )}
                          >
                            <span>{suggestion.label}</span>
                            <span className="text-xs text-zinc-500">{suggestion.hint}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-2 text-sm text-zinc-400">No results. Try &quot;leads&quot;, &quot;playbook&quot;, &quot;logout&quot;, or a path like &quot;/dashboard&quot;.</p>
                    )}
                  </div>
                ) : null}
                {magicBarStatus ? <p className="mt-2 text-xs text-zinc-500">{magicBarStatus}</p> : null}
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5">
                <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 xl:inline">Role</span>
                <select
                  aria-label="Active role"
                  value={activeRole}
                  onChange={(event) => setActiveRole(event.target.value as UserRole)}
                  className="bg-transparent text-xs font-semibold uppercase tracking-[0.16em] text-zinc-200 outline-none"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role} className="bg-zinc-900 text-zinc-200">
                      {role.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              >
                Logout
              </button>
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20 sm:inline-flex"
              >
                AI Playbook
              </button>
              <button className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-zinc-200">
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          drawerOpen || mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => {
          setDrawerOpen(false);
          setMobileNavOpen(false);
        }}
      />
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full w-[min(88vw,20rem)] border-r border-zinc-800 bg-zinc-900 p-4 shadow-2xl transition-transform duration-300 lg:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-100">
            <Command className="h-4 w-4" />
            <p className="text-sm font-semibold">Felix CRM OS</p>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-zinc-700 p-1.5 text-zinc-400 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1">
          {navByRole[activeRole].map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={`mobile-${item.href}`}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                  active
                    ? "bg-zinc-800 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                    : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-zinc-800 bg-zinc-900 p-6 shadow-2xl transition-transform duration-300",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-200">
            <Bot className="h-5 w-5" />
            <h2 className="text-lg font-semibold">AI Playbook</h2>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="rounded-lg border border-zinc-700 p-1.5 text-zinc-400 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          {playbookCards.map((section) => (
            <div key={section.title} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <p className="mb-2 font-medium text-zinc-100">{section.title}</p>
              <p className="text-zinc-400">{section.body}</p>
            </div>
          ))}
          <button
            onClick={generatePlaybook}
            disabled={isGeneratingPlaybook}
            className="w-full rounded-xl bg-blue-500 px-4 py-2.5 font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isGeneratingPlaybook ? "Generating..." : "Generate New Playbook"}
          </button>
        </div>
      </aside>
    </div>
  );
}
