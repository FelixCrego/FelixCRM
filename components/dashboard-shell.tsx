"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Command, Flame, LayoutDashboard, Search, Wallet, Briefcase, Bell, Sparkles, X, Inbox } from "lucide-react";
import { useState } from "react";

type PlaybookCard = {
  title: string;
  body: string;
};

const navSections = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/scrape", label: "Scrape Leads", icon: Search },
      { href: "/leads", label: "My Leads", icon: Inbox },
      { href: "/pipeline", label: "Pipeline", icon: Flame },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/commissions", label: "Commissions", icon: Wallet },
      { href: "/payouts", label: "Payouts", icon: Briefcase },
    ],
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
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

          {navSections.map((section) => (
            <div key={section.title} className="mb-6">
              <p className="mb-2 px-3 text-xs uppercase tracking-[0.2em] text-zinc-500">{section.title}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
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
          ))}
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-zinc-400">
                <Sparkles className="h-4 w-4 text-blue-300" />
                <input
                  aria-label="Magic Bar"
                  placeholder="Magic Bar: find leads, notes, or command workflows"
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                />
              </div>
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20"
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
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setDrawerOpen(false)}
      />
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
