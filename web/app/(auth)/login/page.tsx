import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasAnyUser } from "@/lib/auth/first-run";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  if (!hasAnyUser(db)) redirect("/setup");
  return (
    <AuthCard>
      <LoginForm />
    </AuthCard>
  );
}
