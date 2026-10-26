"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { calculateOrderTotals, formatRupiah } from "@pantrio/core";
import { useTenant } from "../tenant-context";
import { updateBusinessSettings, updateReceiptText, updateTaxSettings, type Result } from "./actions";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-3 outline-none focus:border-neutral-900";

function SettingsCard({
  title,
  intro,
  action,
  submitLabel,
  children,
}: {
  title: string;
  intro: ReactNode;
  action: (slug: string, formData: FormData) => Promise<Result>;
  submitLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { slug } = useTenant();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          setSaved(false);
          const result = await action(slug, formData);
          if (!result.ok) setError(result.error);
          else {
            setSaved(true);
            router.refresh();
          }
        })
      }
      className="space-y-5 rounded-2xl bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{intro}</p>
      </div>
      {children}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-neutral-900 py-4 font-medium text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-3 text-sm text-neutral-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5" />
      {label}
    </label>
  );
}

export type TaxValues = {
  price_mode: "exclusive" | "inclusive";
  service_bps: number;
  pb1_bps: number;
  pb1_on_service: boolean;
  service_is_revenue: boolean;
  income_tax_mode: "pph_final_umkm" | "custom" | "none";
  income_tax_bps: number;
  income_tax_free_annual_turnover: number;
};

export function TaxForm({ values }: { values: TaxValues }) {
  const [mode, setMode] = useState(values.price_mode);
  const [service, setService] = useState(String(values.service_bps / 100));
  const [pb1, setPb1] = useState(String(values.pb1_bps / 100));
  const [onService, setOnService] = useState(values.pb1_on_service);

  // Live worked example on a Rp 100.000 order (FOKAS settings-form), so the
  // effect is visible before saving, not discovered on a customer's bill.
  const preview = calculateOrderTotals([{ unitPrice: 100_000, qty: 1 }], {
    priceMode: mode,
    serviceBps: Math.round((Number(service) || 0) * 100),
    pb1Bps: Math.round((Number(pb1) || 0) * 100),
    pb1OnService: onService,
  });

  return (
    <SettingsCard
      title="Tax & service"
      intro="Applies to new orders only. Every order stores the rules it was sold under, so changing these never alters past receipts. Confirm rates with your tax consultant — PB1/PBJT is set by your regency."
      action={updateTaxSettings}
      submitLabel="Save tax settings"
    >
      <Field label="Menu prices">
        <select name="price_mode" value={mode} onChange={(e) => setMode(e.target.value as TaxValues["price_mode"])} className={input}>
          <option value="exclusive">Exclude tax — tax is added at the till</option>
          <option value="inclusive">Include tax — the menu price is what the customer pays</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Service charge (%)">
          <input name="service_bps" type="number" min="0" max="99.99" step="0.01" value={service} onChange={(e) => setService(e.target.value)} className={input} />
        </Field>
        <Field label="Tax / PB1 (%)">
          <input name="pb1_bps" type="number" min="0" max="99.99" step="0.01" value={pb1} onChange={(e) => setPb1(e.target.value)} className={input} />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm text-neutral-700">
        <input type="checkbox" name="pb1_on_service" checked={onService} onChange={(e) => setOnService(e.target.checked)} className="h-5 w-5" />
        Charge PB1 on the service charge too (usual in Indonesia)
      </label>
      <Check name="service_is_revenue" label="Service charge is restaurant revenue (untick if it goes to staff)" defaultChecked={values.service_is_revenue} />

      <div className="space-y-1 rounded-xl bg-neutral-50 p-4 text-sm">
        <p className="font-medium text-neutral-700">On a {formatRupiah(100_000)} menu price</p>
        <div className="flex justify-between text-neutral-600">
          <span>Before tax</span>
          <span className="tabular-nums">{formatRupiah(preview.subtotal)}</span>
        </div>
        <div className="flex justify-between text-neutral-600">
          <span>Service</span>
          <span className="tabular-nums">{formatRupiah(preview.serviceTotal)}</span>
        </div>
        <div className="flex justify-between text-neutral-600">
          <span>Tax</span>
          <span className="tabular-nums">{formatRupiah(preview.taxTotal)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
          <span>Customer pays</span>
          <span className="tabular-nums">{formatRupiah(preview.grandTotal)}</span>
        </div>
      </div>

      <div className="space-y-3 border-t border-neutral-100 pt-4">
        <p className="text-sm font-medium text-neutral-700">Income tax (for profit after tax in reports)</p>
        <Field label="Scheme">
          <select name="income_tax_mode" defaultValue={values.income_tax_mode} className={input}>
            <option value="pph_final_umkm">PPh Final UMKM — 0,5% of turnover</option>
            <option value="custom">Custom rate</option>
            <option value="none">None</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custom rate (%)">
            <input name="income_tax_bps" type="number" min="0" max="99.99" step="0.01" defaultValue={values.income_tax_bps / 100} className={input} />
          </Field>
          <Field label="Tax-free turnover / year (Rp)" hint="e.g. 500000000 for individuals">
            <input name="income_tax_free_annual_turnover" type="number" min="0" step="1" defaultValue={values.income_tax_free_annual_turnover} className={input} />
          </Field>
        </div>
      </div>
    </SettingsCard>
  );
}

export function BusinessForm({ timezone, cutover }: { timezone: string; cutover: number }) {
  return (
    <SettingsCard
      title="Business day"
      intro="The business day decides which day a late order belongs to in Orders and Sales."
      action={updateBusinessSettings}
      submitLabel="Save"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Timezone">
          <select name="timezone" defaultValue={timezone} className={input}>
            <option value="Asia/Jakarta">WIB — Jakarta</option>
            <option value="Asia/Makassar">WITA — Makassar, Bali</option>
            <option value="Asia/Jayapura">WIT — Jayapura</option>
            <option value="Asia/Singapore">Singapore</option>
            <option value="Asia/Kuala_Lumpur">Kuala Lumpur</option>
          </select>
        </Field>
        <Field label="Day starts at" hint="05:00 keeps a late shift in one day">
          <select name="day_cutover_hour" defaultValue={cutover} className={input}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Field>
      </div>
    </SettingsCard>
  );
}

export function ReceiptForm({ header, footer }: { header: string; footer: string }) {
  return (
    <SettingsCard
      title="Receipt text"
      intro="Start with the shop name, then address and phone. A 58mm receipt is 32 characters wide, so keep lines short. When a receipt logo is set (Logo, above), it prints in place of the first line."
      action={updateReceiptText}
      submitLabel="Save receipt text"
    >
      <Field label="Header">
        <textarea name="receipt_header" defaultValue={header} rows={4} placeholder={"NAMA TOKO\nJl. ...\n0812-...."} className={`${input} font-mono text-sm`} />
      </Field>
      <Field label="Footer">
        <textarea name="receipt_footer" defaultValue={footer} rows={3} placeholder={"Terima kasih!\nIG @..."} className={`${input} font-mono text-sm`} />
      </Field>
    </SettingsCard>
  );
}
