"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { LoginForm } from "@/components/login-form";
import { LogoOnDark } from "@/components/tenant-logo";
import { markTerminalActivity } from "@/lib/terminal-activity";
import { clock, lockTerminal, pinSignIn, type PinResult } from "./terminal-actions";

// The lock screen of a registered terminal (P25): PIN → who you are → clock
// in/out (with a webcam photo against buddy-punching) or open the till.
// Times are shown in the device's own clock; the database records now().

type Person = Extract<PinResult, { ok: true }>;
type Stage =
  | { kind: "pin" }
  | { kind: "welcome"; person: Person }
  | { kind: "camera"; person: Person; clock: "in" | "out" }
  | { kind: "done"; person: Person; message: string; leaving: boolean };

const WELCOME_IDLE_MS = 60_000;
/** Fresh idle clock, so the till doesn't lock the moment it opens. */
function openPos(home: string) {
  markTerminalActivity();
  window.location.assign(home);
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function TerminalLogin(props: {
  slug: string;
  title: string;
  terminalName: string;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
  fallback: string;
}) {
  const [email, setEmail] = useState(false);
  if (email) {
    return (
      <div>
        <LoginForm title={props.title} subtitle={`Terminal · ${props.terminalName}`} logoUrl={props.logoUrl} logoOnDarkUrl={props.logoOnDarkUrl} fallback={props.fallback} />
        <button onClick={() => setEmail(false)} className="fixed bottom-6 left-1/2 -translate-x-1/2 text-sm text-neutral-400 underline">
          Use PIN instead
        </button>
      </div>
    );
  }
  return <PinScreen {...props} onEmail={() => setEmail(true)} />;
}

function PinScreen({
  slug,
  title,
  terminalName,
  logoUrl,
  logoOnDarkUrl,
  onEmail,
}: {
  slug: string;
  title: string;
  terminalName: string;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
  onEmail: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "pin" });
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lock = useCallback(() => {
    startTransition(async () => {
      await lockTerminal(slug);
      setPin("");
      setError(null);
      setStage({ kind: "pin" });
    });
  }, [slug]);

  const submit = useCallback(
    (value: string) => {
      if (value.length < 4) return;
      startTransition(async () => {
        setError(null);
        const result = await pinSignIn(slug, value);
        setPin("");
        if (!result.ok) setError(result.error);
        else setStage({ kind: "welcome", person: result });
      });
    },
    [slug]
  );

  // Physical keyboard on a laptop.
  useEffect(() => {
    if (stage.kind !== "pin") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") submit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage.kind, pin, submit]);

  // Nobody walks away signed in: the welcome screens lock themselves.
  useEffect(() => {
    if (stage.kind === "pin" || stage.kind === "camera") return;
    const ms = stage.kind === "done" && stage.leaving ? 5_000 : WELCOME_IDLE_MS;
    const t = window.setTimeout(lock, ms);
    return () => window.clearTimeout(t);
  }, [stage, lock]);

  const card = "w-full max-w-sm space-y-5 rounded-2xl bg-neutral-900 p-8 shadow-xl";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      {stage.kind === "pin" && (
        <div className={card}>
          <div>
            <div className="mb-4">
              <LogoOnDark name={title} logoUrl={logoUrl} logoOnDarkUrl={logoOnDarkUrl} />
            </div>
            <h1 className="text-xl font-semibold text-neutral-50">Enter your PIN</h1>
            <p className="mt-1 text-sm text-neutral-400">Terminal · {terminalName}</p>
          </div>
          <div className="flex h-8 items-center justify-center gap-3" aria-live="polite">
            {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
              <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-neutral-50" : "bg-neutral-700"}`} />
            ))}
          </div>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Key key={d} onClick={() => setPin((p) => (p.length < 6 ? p + d : p))} disabled={pending}>
                {d}
              </Key>
            ))}
            <Key onClick={() => setPin((p) => p.slice(0, -1))} disabled={pending} muted>
              ⌫
            </Key>
            <Key onClick={() => setPin((p) => (p.length < 6 ? p + "0" : p))} disabled={pending}>
              0
            </Key>
            <Key onClick={() => submit(pin)} disabled={pending || pin.length < 4} primary>
              {pending ? "…" : "OK"}
            </Key>
          </div>
          <button onClick={onEmail} className="w-full text-sm text-neutral-400 underline">
            Sign in with email instead
          </button>
        </div>
      )}

      {stage.kind === "welcome" && (
        <div className={card}>
          <div>
            <p className="text-sm text-neutral-400">Hi,</p>
            <h1 className="text-2xl font-semibold text-neutral-50">{stage.person.name}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {stage.person.clockedInAt ? `On shift since ${time(stage.person.clockedInAt)}` : "Not clocked in"}
            </p>
          </div>
          {stage.person.missingOutOn && !stage.person.clockedInAt && (
            <p className="rounded-lg bg-amber-500/15 p-3 text-sm text-amber-200">
              Your shift on {stage.person.missingOutOn} has no clock-out. Tell a manager so they can fix the hours.
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="space-y-3">
            <button
              onClick={() => setStage({ kind: "camera", person: stage.person, clock: stage.person.clockedInAt ? "out" : "in" })}
              className={`w-full rounded-lg py-4 text-lg font-semibold ${stage.person.clockedInAt ? "bg-amber-400 text-neutral-950" : "bg-green-500 text-neutral-950"}`}
            >
              {stage.person.clockedInAt ? "Clock out" : "Clock in"}
            </button>
            <button onClick={() => openPos(stage.person.home)} className="w-full rounded-lg bg-neutral-50 py-4 text-lg font-medium text-neutral-900">
              Open POS
            </button>
            <button onClick={lock} disabled={pending} className="w-full rounded-lg border border-neutral-700 py-3 text-neutral-300">
              Lock
            </button>
          </div>
        </div>
      )}

      {stage.kind === "camera" && (
        <ClockCamera
          kind={stage.clock}
          onCancel={() => setStage({ kind: "welcome", person: stage.person })}
          onSubmit={(photo) =>
            new Promise<void>((resolve) =>
              startTransition(async () => {
                const fd = new FormData();
                if (photo) fd.set("photo", photo, "photo.jpg");
                const result = await clock(slug, stage.clock, fd);
                resolve();
                if (!result.ok) {
                  setError(result.error);
                  setStage({ kind: "welcome", person: stage.person });
                  return;
                }
                setError(null);
                const leaving = stage.clock === "out";
                setStage({
                  kind: "done",
                  person: { ...stage.person, clockedInAt: leaving ? null : result.at },
                  message: `${leaving ? "Clocked out" : "Clocked in"} at ${time(result.at)}${photo ? "" : " (no photo)"}`,
                  leaving,
                });
              })
            )
          }
        />
      )}

      {stage.kind === "done" && (
        <div className={card}>
          <h1 className="text-2xl font-semibold text-neutral-50">{stage.message}</h1>
          <p className="text-sm text-neutral-400">{stage.leaving ? `See you, ${stage.person.name}. Locking…` : stage.person.name}</p>
          <div className="space-y-3">
            {!stage.leaving && (
              <button onClick={() => openPos(stage.person.home)} className="w-full rounded-lg bg-neutral-50 py-4 text-lg font-medium text-neutral-900">
                Open POS
              </button>
            )}
            <button onClick={lock} disabled={pending} className="w-full rounded-lg border border-neutral-700 py-3 text-neutral-300">
              Lock
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Key({
  children,
  onClick,
  disabled,
  primary,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-16 rounded-xl text-2xl font-medium disabled:opacity-40 ${
        primary ? "bg-neutral-50 text-neutral-900" : muted ? "bg-neutral-800 text-neutral-400" : "bg-neutral-800 text-neutral-50 active:bg-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

/** Front camera → a small JPEG. No camera (or refused) → clock without a photo. */
function ClockCamera({
  kind,
  onCancel,
  onSubmit,
}: {
  kind: "in" | "out";
  onCancel: () => void;
  onSubmit: (photo: Blob | null) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live: MediaStream | null = null;
    let cancelled = false;
    const media = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false })
      : Promise.reject(new Error("no camera API"));
    media
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        live = s;
        setStream(s);
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      live?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function take() {
    setBusy(true);
    let blob: Blob | null = null;
    const v = video.current;
    if (stream && v && v.videoWidth > 0) {
      const w = 480;
      const h = Math.round((v.videoHeight / v.videoWidth) * w);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(v, 0, 0, w, h);
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    }
    stream?.getTracks().forEach((t) => t.stop());
    await onSubmit(blob);
  }

  const label = kind === "in" ? "Clock in" : "Clock out";
  return (
    <div className="w-full max-w-md space-y-4 rounded-2xl bg-neutral-900 p-6 shadow-xl">
      <h1 className="text-xl font-semibold text-neutral-50">{label} — look at the camera</h1>
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-neutral-800">
        {failed ? (
          <p className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-400">
            Camera not available. You can still {label.toLowerCase()}; it will be marked “no photo”.
          </p>
        ) : (
          <video ref={video} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} disabled={busy} className="flex-1 rounded-lg border border-neutral-700 py-4 text-neutral-300">
          Back
        </button>
        <button
          onClick={take}
          disabled={busy || (!failed && !stream)}
          className="flex-[2] rounded-lg bg-neutral-50 py-4 text-lg font-semibold text-neutral-900 disabled:opacity-40"
        >
          {busy ? "Saving…" : failed ? `${label} without photo` : `Take photo & ${label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
