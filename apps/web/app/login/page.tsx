import { Suspense } from "react";
import { LoginCard } from "@/components/auth/login-card";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Logo />
      <Suspense>
        <LoginCard />
      </Suspense>
    </div>
  );
}
