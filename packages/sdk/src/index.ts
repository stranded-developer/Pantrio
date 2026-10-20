import {
  costChangedEvent,
  menuItemCost,
  type CostChangedEvent,
  type MenuItemCost,
  type MenuItemPush,
} from "@pantrio/core";
import { z } from "zod";

// @pantrio/sdk — what a POS installs to talk to Pantrio.
//
// Integration rule (P4): a POS must never call Pantrio while taking a sale.
// Use this client to sync menus and refresh a *local* cost cache; snapshot
// that cached cost onto order lines at sale time.

export type PantrioClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export class PantrioError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "PantrioError";
  }
}

export class PantrioClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PantrioClientOptions) {
    if (!opts.apiKey) throw new Error("Pantrio API key is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://pantrio.vercel.app").replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async request<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json as { error?: string } | null)?.error ?? res.statusText;
      throw new PantrioError(res.status, msg);
    }
    return schema.parse(json);
  }

  /** Current cost and margin for every mapped menu item. */
  listMenuItems(): Promise<MenuItemCost[]> {
    return this.request("GET", "/menu-items", z.object({ items: z.array(menuItemCost) })).then((r) => r.items);
  }

  getMenuItemCost(externalId: string): Promise<MenuItemCost> {
    return this.request("GET", `/menu-items/${encodeURIComponent(externalId)}/cost`, menuItemCost);
  }

  /** Upsert the POS menu. The POS owns name and selling price (P3). */
  pushMenuItems(items: MenuItemPush[]): Promise<{ upserted: number }> {
    return this.request("PUT", "/menu-items", z.object({ upserted: z.number().int() }), { items });
  }
}

// ── Webhooks ──────────────────────────────────────────────────────────────
// Header: `Pantrio-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`
// Timestamped so a captured request cannot be replayed later.

export const SIGNATURE_HEADER = "pantrio-signature";
const DEFAULT_TOLERANCE_S = 300;

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Verify and parse a Pantrio webhook. Pass the **raw** request body — a
 * re-serialised JSON object will not match the signature.
 */
export async function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  opts: { toleranceSeconds?: number; now?: number } = {}
): Promise<CostChangedEvent> {
  if (!signatureHeader) throw new WebhookVerificationError("Missing signature header");
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) throw new WebhookVerificationError("Malformed signature header");

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? DEFAULT_TOLERANCE_S)) {
    throw new WebhookVerificationError("Signature timestamp outside tolerance");
  }
  if (!timingSafeEqual(await hmacHex(secret, `${t}.${rawBody}`), parts.v1)) {
    throw new WebhookVerificationError("Signature mismatch");
  }
  return costChangedEvent.parse(JSON.parse(rawBody));
}

export type { CostChangedEvent, MenuItemCost, MenuItemPush };
