const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const formatINR = (n: number, decimals = true) => (decimals && n % 1 !== 0 ? inr : inr0).format(n);

export function formatDateTime(iso: string | Date) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(iso: string | Date) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

export const featureLabel = (name: string) => name.replace(/_/g, " ");

const isFlagFeature = (name: string) => name.startsWith("is_") || name.startsWith("ctx_");

/** Yes/No for 0/1 flag features, otherwise a compact number. */
export function formatFeatureValue(name: string, value: number | null | undefined) {
  if (value == null) return "—";
  if (isFlagFeature(name)) return value ? "Yes" : "No";
  if (Number.isInteger(value)) return value.toLocaleString("en-IN");
  return value.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(value) < 1 ? 3 : 2 });
}
