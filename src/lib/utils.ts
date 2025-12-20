import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVolume(vol?: number | string) {
  if (!vol) return "N/A";
  const num = typeof vol === "string" ? Number.parseFloat(vol) : vol;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatPrice(price: string | number) {
  const num = typeof price === "string" ? Number.parseFloat(price) : price;
  return (num * 100).toFixed(1);
}
