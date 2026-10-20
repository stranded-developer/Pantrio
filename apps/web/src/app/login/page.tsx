import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Pantrio" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const form = (next?: string) => (
    <LoginForm title="Pantrio" subtitle="POS, costing and stock" next={next} fallback="/dashboard" />
  );
  return (
    <Suspense fallback={form()}>
      {searchParams.then((sp) => form(typeof sp.next === "string" ? sp.next : undefined))}
    </Suspense>
  );
}
