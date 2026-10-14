import { BrainCircuit, MessageCircleQuestion, ShieldCheck, Timer } from "lucide-react";
import { Suspense } from "react";
import { LoginCard } from "@/components/auth/login-card";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const POINTS = [
  { icon: BrainCircuit, title: "Rules + machine learning", text: "Clear rules and a calibrated model score every payment before it is sent." },
  { icon: ShieldCheck, title: "Explains itself", text: "Every warning says why, in plain language: new recipient, unusual amount, and more." },
  { icon: MessageCircleQuestion, title: "Asks the right questions", text: "Was someone pressuring you? Asked for an OTP? Your answers are scored too." },
  { icon: Timer, title: "Slows down risky payments", text: "High-risk payments need a short pause and a re-typed UPI ID. Scammers rely on hurry." },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-8 lg:grid-cols-[1.2fr_1fr] lg:py-16">
        <section>
          <p className="text-sm font-medium text-primary">Pre-transaction scam detection for UPI-style wallets</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Stop the scam before the money moves.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            ScamShield checks each payment in a fraction of a second and steps in only when something looks wrong.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} className="rounded-xl border border-border bg-surface p-4">
                <p.icon className="size-5 text-primary" aria-hidden />
                <p className="mt-2 font-medium">{p.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs text-subtle">
            College mini project demo. All users, payments and money are synthetic; no real bank is connected. ScamShield reduces risk but
            cannot guarantee that every scam is caught.
          </p>
        </section>
        <section className="flex justify-center lg:justify-end">
          <Suspense>
            <LoginCard />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
