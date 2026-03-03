import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...args: Parameters<typeof clsx>) {
  return twMerge(clsx(args));
}

export function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function dedupeKey(name: string, city: string, type: string, phone?: string, domain?: string) {
  return [normalize(name), normalize(city), normalize(type), normalize(phone ?? ""), normalize(domain ?? "")].join("|");
}
