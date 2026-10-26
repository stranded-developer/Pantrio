// Types for receipt.mjs, so the web app's Settings preview can use the exact
// layout the printer box prints (one implementation, two consumers).

export type ReceiptData = {
  order: {
    order_no: number;
    queue_no: number | null;
    status: string;
    opened_at: string;
    price_mode?: "exclusive" | "inclusive";
    subtotal: number;
    service_total: number;
    tax_total: number;
    grand_total: number;
    cashier?: string | null;
  };
  items: {
    name_snapshot: string;
    qty: number;
    unit_price: number;
    line_subtotal: number;
    voided: boolean;
    modifiers_json: unknown;
  }[];
  payment: { method: string; amount_tendered: number | null; change_given: number | null } | null;
  settings: { receipt_header: string; receipt_footer: string; timezone?: string };
};

export type ReceiptOptions = { width?: number; reprint?: boolean; logo?: unknown };

export function renderText(data: ReceiptData, options?: ReceiptOptions): string;
export function buildReceipt(data: ReceiptData, options?: ReceiptOptions): Uint8Array;
export function money(amount: number): string;

export type ReceiptBlock = { align?: "left" | "center"; bold?: boolean; size?: number; lines: string[] };
export function receiptBlocks(data: ReceiptData, options?: ReceiptOptions): ReceiptBlock[];
