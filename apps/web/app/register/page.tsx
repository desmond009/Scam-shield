"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage } from "@/lib/api";
import { useRegister } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const fieldErrors = (register.error instanceof ApiError &&
    (register.error.details as { fieldErrors?: Record<string, string[]> })?.fieldErrors) || {};
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Create a wallet</CardTitle>
          <CardDescription>You get ₹25,000 of demo money to try payments. Nothing here is real money.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              register.mutate(form, { onSuccess: () => router.replace("/wallet") });
            }}
          >
            {(["name", "email", "password"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={k}>{k === "name" ? "Full name" : k === "email" ? "Email" : "Password (8+ characters)"}</Label>
                <Input
                  id={k}
                  type={k === "password" ? "password" : k === "email" ? "email" : "text"}
                  autoComplete={k === "password" ? "new-password" : k}
                  required
                  value={form[k]}
                  onChange={set(k)}
                  aria-invalid={!!fieldErrors[k]}
                />
                {fieldErrors[k] && <p className="text-xs text-critical">{fieldErrors[k][0]}</p>}
              </div>
            ))}
            {register.isError && !Object.keys(fieldErrors).length && (
              <p role="alert" className="text-sm text-critical">
                {errorMessage(register.error)}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={register.isPending}>
              {register.isPending && <Loader2 className="animate-spin" />}
              Create wallet
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have one?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
