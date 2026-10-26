"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Fixed monthly costs (P11). Wages and default amounts are versioned by the
// month they take effect, so a change never restates a past month; a single
// month's real bill is an "actual" that overrides the default for that month
// only. Runs as the signed-in manager — RLS keeps wages manager-only.

export type Result = { ok: true } | { ok: false; error: string };

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month.");
const toDate = (m: string) => `${m}-01`;
const rupiah = (label: string) => z.coerce.number().int(`${label}: whole rupiah only.`).min(0, `${label} can't be negative.`);
const fail = (m: string): Result => ({ ok: false, error: m.replace(/^.*?:\s*(?=[A-Z])/, "") });

async function guard(slug: string) {
  const { org } = await requireMembership(slug, ["owner", "manager"]);
  return { org, supabase: await createClient() };
}
const done = (slug: string): Result => {
  revalidatePath(`/o/${slug}/profit`);
  return { ok: true };
};

export async function addStaffWage(slug: string, fd: FormData): Promise<Result> {
  const p = z
    .object({ name: z.string().trim().min(1, "Enter a name.").max(100), role: z.string().trim().max(60), wage: rupiah("Wage"), from: month })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const { org, supabase } = await guard(slug);
  const { data, error } = await supabase
    .from("staff_members")
    .insert({ org_id: org.id, name: p.data.name, role: p.data.role || null })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "Could not add.");
  const { error: e2 } = await supabase
    .from("staff_wages")
    .insert({ org_id: org.id, staff_id: data.id, monthly_wage: p.data.wage, effective_from: toDate(p.data.from) });
  return e2 ? fail(e2.message) : done(slug);
}

/** A raise (or cut) from a month onward; earlier months keep the old wage. */
export async function setWage(slug: string, staffId: string, fd: FormData): Promise<Result> {
  const p = z.object({ wage: rupiah("Wage"), from: month }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const { org, supabase } = await guard(slug);
  const { error } = await supabase
    .from("staff_wages")
    .upsert(
      { org_id: org.id, staff_id: staffId, monthly_wage: p.data.wage, effective_from: toDate(p.data.from) },
      { onConflict: "staff_id,effective_from" }
    );
  return error ? fail(error.message) : done(slug);
}

/** Last month this person is paid for; null = still working. */
export async function setStaffEnd(slug: string, staffId: string, end: string | null): Promise<Result> {
  if (end !== null && !month.safeParse(end).success) return fail("Pick a month.");
  const { org, supabase } = await guard(slug);
  const { error } = await supabase
    .from("staff_members")
    .update({ end_month: end ? toDate(end) : null })
    .eq("id", staffId)
    .eq("org_id", org.id);
  return error ? fail(error.message) : done(slug);
}

const category = z.enum(["rent", "electricity", "water", "gas", "internet", "other"]);

export async function addFixedCost(slug: string, fd: FormData): Promise<Result> {
  const p = z
    .object({
      name: z.string().trim().min(1, "Name the cost.").max(100),
      category,
      amount: rupiah("Amount"),
      period: z.enum(["monthly", "yearly"]),
      from: month,
    })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const { org, supabase } = await guard(slug);
  const { data, error } = await supabase
    .from("fixed_costs")
    .insert({ org_id: org.id, name: p.data.name, category: p.data.category })
    .select("id")
    .single();
  if (error || !data) return fail(error?.message ?? "Could not add.");
  const { error: e2 } = await supabase.from("fixed_cost_rates").insert({
    org_id: org.id,
    fixed_cost_id: data.id,
    amount: p.data.amount,
    period: p.data.period,
    effective_from: toDate(p.data.from),
  });
  return e2 ? fail(e2.message) : done(slug);
}

/** New default (e.g. PLN tariff change) from a month onward. */
export async function setFixedRate(slug: string, costId: string, fd: FormData): Promise<Result> {
  const p = z.object({ amount: rupiah("Amount"), period: z.enum(["monthly", "yearly"]), from: month }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(p.error.issues[0]!.message);
  const { org, supabase } = await guard(slug);
  const { error } = await supabase.from("fixed_cost_rates").upsert(
    {
      org_id: org.id,
      fixed_cost_id: costId,
      amount: p.data.amount,
      period: p.data.period,
      effective_from: toDate(p.data.from),
    },
    { onConflict: "fixed_cost_id,effective_from" }
  );
  return error ? fail(error.message) : done(slug);
}

/** The real bill for one month; overrides the default for that month only. */
export async function setActual(slug: string, costId: string, forMonth: string, amount: number | null): Promise<Result> {
  if (!month.safeParse(forMonth).success) return fail("Pick a month.");
  const { org, supabase } = await guard(slug);
  if (amount === null) {
    const { error } = await supabase
      .from("fixed_cost_actuals")
      .delete()
      .eq("fixed_cost_id", costId)
      .eq("month", toDate(forMonth))
      .eq("org_id", org.id);
    return error ? fail(error.message) : done(slug);
  }
  const a = rupiah("Amount").safeParse(amount);
  if (!a.success) return fail(a.error.issues[0]!.message);
  const { error } = await supabase
    .from("fixed_cost_actuals")
    .upsert(
      { org_id: org.id, fixed_cost_id: costId, month: toDate(forMonth), amount: a.data },
      { onConflict: "fixed_cost_id,month" }
    );
  return error ? fail(error.message) : done(slug);
}
