"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AccountState = { error?: string; ok?: string };

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(100),
    password: z.union([z.literal(""), z.string().min(8, "New password must be at least 8 characters")]),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export async function updateAccount(_: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.name }).eq("id", user.id);
  if (error) return { error: error.message };
  if (parsed.data.password) {
    const { error: pwError } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (pwError) return { error: pwError.message };
  }
  return { ok: parsed.data.password ? "Saved. Your password has changed." : "Saved." };
}
