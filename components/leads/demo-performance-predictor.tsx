"use client";

type Props = {
  businessName: string;
  currentWebsite: string;
  demoWebsite: string;
  city: string;
  businessType: string;
};

export function DemoPerformancePredictor({ businessName, currentWebsite, demoWebsite, city, businessType }: Props) {
  const hasDemo = Boolean(demoWebsite);
  return (
    <section className="rounded-xl border border-zinc-700/80 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold text-zinc-100">Demo performance snapshot</h2>
      <p className="mt-2 text-sm text-zinc-300">
        {hasDemo
          ? `${businessName || "This business"}${city ? ` in ${city}` : ""} has a live demo ready for review${businessType ? ` for the ${businessType} market` : ""}.`
          : "Deploy a demo website to compare the current experience and prepare a conversion-focused pitch."}
      </p>
      <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">Current site: {currentWebsite || "Not available"}</div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">Demo site: {demoWebsite || "Not deployed"}</div>
      </div>
    </section>
  );
}
