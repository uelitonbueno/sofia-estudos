import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: string; action?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-4 border-b border-cyan-300/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="hud-label mb-2">{eyebrow}</p>
        <h1 className="neon-title text-3xl font-black tracking-[-.04em] text-white sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function HudPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("hud-panel", className)}>{children}</section>;
}

export function StatusPill({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "pink" | "amber" | "slate" }) {
  const colors = { cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200", pink: "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-200", amber: "border-amber-300/25 bg-amber-300/10 text-amber-200", slate: "border-slate-300/15 bg-slate-300/5 text-slate-300" };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[.12em]", colors[tone])}>{children}</span>;
}

export function EmptyState({ title, description, icon, action }: { title: string; description: string; icon: ReactNode; action?: ReactNode }) {
  return <HudPanel className="flex min-h-56 flex-col items-center justify-center p-7 text-center">
    <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">{icon}</div>
    <h3 className="text-base font-bold text-slate-100">{title}</h3>
    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </HudPanel>;
}
