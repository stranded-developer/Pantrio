import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Pantrio" };

export default function LoginPage() {
  return <LoginForm title="Pantrio" subtitle="POS, costing and stock" fallback="/dashboard" />;
}
