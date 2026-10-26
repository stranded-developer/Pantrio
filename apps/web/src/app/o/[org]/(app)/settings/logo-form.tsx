"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { imageToPbm, loadImage, type ReceiptLogo } from "@/lib/receipt-logo";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "../tenant-context";
import { saveLogo, type LogoKind } from "./actions";

const btn = "rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40";

/** Upload into logos/<org_id>/… (Storage policy: managers of this org only). */
async function upload(orgId: string, name: string, body: Blob, contentType: string): Promise<string> {
  const supabase = createClient();
  const path = `${orgId}/${name}-${Date.now()}`;
  const { error } = await supabase.storage.from("logos").upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
}

export function LogoForm({
  orgId,
  logoUrl,
  logoOnDarkUrl,
  receiptLogoUrl,
}: {
  orgId: string;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
  receiptLogoUrl: string | null;
}) {
  const router = useRouter();
  const { slug } = useTenant();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Receipt logo: a source image + darkness → live black/white preview.
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [threshold, setThreshold] = useState(160);
  const receipt: ReceiptLogo | null = useMemo(() => (source ? imageToPbm(source, threshold) : null), [source, threshold]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    startTransition(async () => {
      try {
        const r = await fn();
        setMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Failed." });
        if (r.ok) router.refresh();
      } catch (e) {
        setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
      }
    });

  const uploadImage = (kind: LogoKind, file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setMessage({ ok: false, text: "Keep logos under 2 MB." });
    run(async () => {
      const url = await upload(orgId, kind === "logo_url" ? "logo" : "logo-dark", file, file.type || "image/png");
      return saveLogo(slug, kind, url);
    }, "Logo saved.");
  };

  return (
    <section className="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Logo</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Replaces the restaurant name in the till header, the login page, the kitchen screen and the printed receipt.
          PNG with a transparent background works best.
        </p>
      </div>

      <Slot
        title="Logo"
        hint="Dark logo for light backgrounds — the till header."
        url={logoUrl}
        dark={false}
        pending={pending}
        onFile={(f) => uploadImage("logo_url", f)}
        onClear={() => run(() => saveLogo(slug, "logo_url", null), "Logo removed.")}
      />
      <Slot
        title="Logo for dark screens"
        hint="Light logo for the login page and kitchen screen. Optional — without it the logo above sits on a white badge."
        url={logoOnDarkUrl}
        dark
        pending={pending}
        onFile={(f) => uploadImage("logo_on_dark_url", f)}
        onClear={() => run(() => saveLogo(slug, "logo_on_dark_url", null), "Logo removed.")}
      />

      <div className="space-y-3 border-t border-neutral-100 pt-4">
        <div>
          <p className="font-medium text-neutral-900">Receipt logo</p>
          <p className="text-sm text-neutral-500">
            Receipt printers print black only. Pick a source, adjust darkness until it looks right, then save. Printers
            pick it up on the next receipt.
          </p>
        </div>
        {receiptLogoUrl && !receipt && (
          <p className="text-sm text-green-700">A receipt logo is set.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {logoUrl && (
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    setSource(await loadImage(logoUrl));
                  } catch {
                    setMessage({ ok: false, text: "Couldn't read the logo — upload the file below instead." });
                  }
                })
              }
              className={btn}
            >
              Make from logo
            </button>
          )}
          <label className={`${btn} cursor-pointer`}>
            Choose a file…
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setSource(await loadImage(f));
              }}
            />
          </label>
          {receiptLogoUrl && (
            <button disabled={pending} onClick={() => run(() => saveLogo(slug, "receipt_logo_url", null), "Receipt logo removed.")} className={btn}>
              Remove
            </button>
          )}
        </div>
        {receipt && (
          <div className="space-y-3 rounded-xl bg-neutral-50 p-4">
            <div className="mx-auto w-fit border border-dashed border-neutral-300 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated preview */}
              <img src={receipt.previewUrl} alt="Receipt logo preview" style={{ imageRendering: "pixelated" }} className="max-w-full" />
            </div>
            <label className="flex items-center gap-3 text-sm text-neutral-700">
              Lighter
              <input type="range" min={60} max={240} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="flex-1" />
              Darker
            </label>
            <p className="text-xs text-neutral-500">
              {receipt.width} × {receipt.height} dots — fits 58mm and 80mm paper.
            </p>
            <button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const url = await upload(orgId, "receipt", new Blob([receipt.pbm.slice()]), "application/octet-stream");
                  const r = await saveLogo(slug, "receipt_logo_url", url);
                  if (r.ok) setSource(null);
                  return r;
                }, "Receipt logo saved — it prints from the next receipt.")
              }
              className="w-full rounded-xl bg-neutral-900 py-3 font-medium text-white disabled:opacity-40"
            >
              Save receipt logo
            </button>
          </div>
        )}
      </div>

      {message && (
        <p className={`rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}
    </section>
  );
}

function Slot({
  title,
  hint,
  url,
  dark,
  pending,
  onFile,
  onClear,
}: {
  title: string;
  hint: string;
  url: string | null;
  dark: boolean;
  pending: boolean;
  onFile: (f: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className={`flex h-16 w-40 items-center justify-center rounded-lg border ${dark ? "border-neutral-700 bg-neutral-900" : "border-neutral-200 bg-white"}`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- tenant upload
          <img src={url} alt={title} className="max-h-12 max-w-36" />
        ) : (
          <span className={`text-xs ${dark ? "text-neutral-500" : "text-neutral-400"}`}>none</span>
        )}
      </div>
      <div className="min-w-48 flex-1">
        <p className="font-medium text-neutral-900">{title}</p>
        <p className="text-sm text-neutral-500">{hint}</p>
      </div>
      <div className="flex gap-2">
        <label className={`${btn} cursor-pointer ${pending ? "pointer-events-none opacity-40" : ""}`}>
          {url ? "Replace" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {url && (
          <button disabled={pending} onClick={onClear} className={btn}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
