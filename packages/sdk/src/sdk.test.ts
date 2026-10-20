import { describe, expect, it } from "vitest";
import { PantrioClient, PantrioError, signWebhook, verifyWebhook, WebhookVerificationError } from "./index";

const event = {
  id: "evt_1",
  type: "menu_item.cost_changed",
  createdAt: "2026-10-20T10:00:00Z",
  data: {
    externalId: "m1",
    name: "Gingerbread",
    sellingPrice: 25_000,
    unitCost: 2_464,
    complete: true,
    marginBeforeTaxBps: 9_014,
    marginAfterTaxBps: 8_964,
    computedAt: "2026-10-20T10:00:00Z",
  },
};
const body = JSON.stringify(event);
const secret = "whsec_test";
const now = 1_790_000_000;

describe("verifyWebhook", () => {
  it("accepts a correctly signed event", async () => {
    const sig = await signWebhook(secret, body, now);
    await expect(verifyWebhook(body, sig, secret, { now })).resolves.toEqual(event);
  });

  it("rejects a tampered body, wrong secret, missing header and replays", async () => {
    const sig = await signWebhook(secret, body, now);
    await expect(verifyWebhook(body.replace("2464", "1"), sig, secret, { now })).rejects.toThrow(
      WebhookVerificationError
    );
    await expect(verifyWebhook(body, sig, "other", { now })).rejects.toThrow("Signature mismatch");
    await expect(verifyWebhook(body, null, secret, { now })).rejects.toThrow("Missing");
    await expect(verifyWebhook(body, sig, secret, { now: now + 301 })).rejects.toThrow("tolerance");
  });
});

describe("PantrioClient", () => {
  it("sends the API key and validates responses", async () => {
    const calls: Request[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push(new Request(url, init));
      return Response.json({ items: [event.data] });
    }) as typeof fetch;
    const client = new PantrioClient({ apiKey: "pk_test", baseUrl: "https://x.test/", fetch: fakeFetch });

    await expect(client.listMenuItems()).resolves.toEqual([event.data]);
    expect(calls[0]?.url).toBe("https://x.test/api/v1/menu-items");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer pk_test");
  });

  it("surfaces API errors with their status", async () => {
    const fakeFetch = (async () => Response.json({ error: "Invalid API key" }, { status: 401 })) as typeof fetch;
    const client = new PantrioClient({ apiKey: "bad", fetch: fakeFetch });
    await expect(client.listMenuItems()).rejects.toEqual(new PantrioError(401, "Invalid API key"));
  });
});
