import { readFileSync } from "node:fs";
import { parsePbm } from "./escpos.mjs";
import { createPrinter } from "./printer.mjs";
import { buildReceipt, renderText } from "./receipt.mjs";

/**
 * Pantrio print bridge — FOKAS's bridge (FOKAS D15/D36), re-keyed for a
 * shared, multi-restaurant database (Pantrio P18).
 *
 * It holds a *device token*, never the Supabase secret key. With it, it can
 * call exactly three database functions, all scoped to its own branch:
 *   device_claim_print_jobs  — atomically claim queued jobs (no double print)
 *   device_receipt_data      — everything one receipt needs
 *   device_finish_print_job  — report printed / failed
 * It cannot read tables, so a stolen box exposes nothing but the ability to
 * print this branch's receipts; revoking the token in Settings → Printers
 * stops it at once.
 *
 * Polls every POLL_MS (default 3 s). The SQL side expires and recovers jobs
 * on its own, so this process holds no state worth losing.
 */

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    console.error(`Missing ${name}. Set it in /etc/pantrio-bridge.env`);
    process.exit(1);
  }
  return value;
};

const url = env("PANTRIO_SUPABASE_URL").replace(/\/$/, "");
const apikey = env("PANTRIO_PUBLISHABLE_KEY");
const token = env("PRINT_DEVICE_TOKEN");
const printer = createPrinter(env("PRINTER", "dry-run"));
const width = Number(env("RECEIPT_WIDTH", "32"));
const pollMs = Math.max(1000, Number(env("POLL_MS", "3000")));
const logo = loadLogo(env("LOGO", "none"));
const BATCH = 5;

/** A missing or broken logo prints text-only receipts — never no receipts. */
function loadLogo(path) {
  if (!path || path === "none") return null;
  try {
    const parsed = parsePbm(readFileSync(path));
    console.log(`Logo: ${path} (${parsed.width}x${parsed.height})`);
    return parsed;
  } catch (error) {
    console.log(`No logo (${error.message}) — printing text header only`);
    return null;
  }
}

class RpcError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function rpc(fn, args) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey, "content-type": "application/json" },
    body: JSON.stringify({ p_token: token, ...args }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new RpcError(res.status, body?.message ?? `HTTP ${res.status}`);
  return body;
}

let draining = false;
let printerWasReady = null;
let lastError = null;

async function drain() {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const ready = await printer.ready();
      if (ready !== printerWasReady) {
        log(ready ? `Printer ready: ${printer.label}` : `Printer NOT reachable: ${printer.label}`);
        printerWasReady = ready;
      }
      if (!ready) return;

      const jobs = await rpc("device_claim_print_jobs", { p_limit: BATCH });
      if (lastError) {
        log("Connected again");
        lastError = null;
      }
      for (const job of jobs ?? []) await printJob(job);
      // A full batch means there may be more waiting.
      if ((jobs ?? []).length < BATCH) return;
    }
  } catch (error) {
    const message = error?.message ?? String(error);
    // Log a repeated failure once, not every 3 seconds.
    if (message !== lastError) log(`Poll failed: ${message}`);
    lastError = message;
    if (error instanceof RpcError && (error.status === 401 || error.status === 403)) {
      log("This printer's key was revoked or is wrong. Get a new one in Settings → Printers.");
    }
  } finally {
    draining = false;
  }
}

async function printJob(job) {
  try {
    if (!job.order_id) throw new Error("Job has no order");
    const data = await rpc("device_receipt_data", { p_order: job.order_id });
    const reprint = job.kind === "reprint";

    if (printer.dryRun) {
      log(`[dry-run] ${job.kind} for order ${data.order.order_no}\n${renderText(data, { width, reprint, logo })}`);
    }
    await printer.send(buildReceipt(data, { width, reprint, logo }));
    await finish(job.id, true);
    log(`Printed ${job.kind} — order #${data.order.order_no} (no. ${data.order.queue_no ?? "-"})`);
  } catch (error) {
    const message = error?.message ?? String(error);
    log(`Job ${job.id} failed (attempt ${job.attempts + 1}): ${message}`);
    await finish(job.id, false, message);
  }
}

async function finish(jobId, ok, message = null) {
  try {
    await rpc("device_finish_print_job", { p_job: jobId, p_ok: ok, p_error: message });
  } catch (error) {
    // The job stays `claimed` and is retried after two minutes. A rare
    // duplicate receipt is the safe failure; a lost one is not.
    log(`Could not record result for job ${jobId}: ${error.message}`);
  }
}

function log(message) {
  // journald adds timestamps; stdout is enough.
  console.log(message);
}

const timer = setInterval(drain, pollMs);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}

log(`Pantrio print bridge started — printer: ${printer.label}, width ${width}, polling every ${pollMs} ms`);
drain();
