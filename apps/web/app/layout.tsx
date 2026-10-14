import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "ScamShield", description: "Stop the scam before the money moves." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
