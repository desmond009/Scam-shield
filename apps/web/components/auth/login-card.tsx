"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { homeFor, useLogin } from "@/lib/auth";
import { setDeviceId } from "@/lib/device";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const DEMO_PASSWORD = "Demo@1234";
export const DEMO_ACCOUNTS = [
  { key: "asha", role: "User", name: "Asha Verma", email: "asha@demo.scamshield.in", hint: "Pays people, sees warnings" },
  { key: "ravi", role: "Analyst", name: "Ravi Iyer", email: "ravi@demo.scamshield.in", hint: "Reviews live alerts" },
  { key: "admin", role: "Admin", name: "Admin", email: "admin@demo.scamshield.in", hint: "Simulator, rules, model, health" },
];

export function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const go = (creds: { email: string; password: string }) =>
    login.mutate(creds, {
      onSuccess: ({ user }) => router.replace(params.get("next") || homeFor(user.role)),
    });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription>Use a demo account below, or your own.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={login.isPending}
              onClick={() => {
                // Demo accounts are bound to a simulated registered phone, so their payments come from a known device.
                setDeviceId(`demo-phone-${a.key}`);
                go({ email: a.email, password: DEMO_PASSWORD });
              }}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-primary-soft disabled:opacity-50"
            >
              <span>
                <span className="font-medium">{a.name}</span>
                <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">{a.role}</span>
                <span className="block text-xs text-muted-foreground">{a.hint}</span>
              </span>
              <LogIn className="size-4 text-muted-foreground" aria-hidden />
            </button>
          ))}
          <p className="text-xs text-muted-foreground">
            Demo password for all accounts: <code className="rounded bg-surface-2 px-1">{DEMO_PASSWORD}</code>
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            go({ email, password });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {login.isError && (
            <p role="alert" className="text-sm text-critical">
              {errorMessage(login.error)}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create a wallet
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
