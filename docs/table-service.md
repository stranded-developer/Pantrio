# Table service (proposal, P29 draft — not built)

User (2026-11-06): FOKAS is counter service (order and pay at the till).
Kawa and other restaurants seat guests at tables: order first, add more
later, pay at the end. A restaurant draws its own floor plan with its own
table numbers. Suggested "self serve mode" and "table serve mode".

## Push-back on "two modes"

Keep one sales engine and one switch, **per branch (outlet)**, not per
restaurant:

- **Table service off** (FOKAS today): every sale is paid at once.
- **Table service on**: the till gets a floor plan, and a sale can be an
  **open bill** on a table. The pay-now sale stays, because table
  restaurants still sell takeaway and walk-ins at the counter.

So "self serve" isn't a separate mode. It's what happens when table
service is off. Two code paths for selling would drift; one path where an
order is either paid now or left open won't. The schema already plans for
this: `order_status` has `open` and `awaiting_payment`, and today every
order goes straight to `paid`.

## What changes

| Area | Today | With table service |
|---|---|---|
| Floor plan | none | Settings → Tables: areas (Indoor, Terrace), tables dragged on a grid, number/name, seats, shape. Never hard-deleted once used (like D12). |
| Order life | `create_order` = price + pay in one call | `open_bill(table)` → `add_to_bill(round)` any number of times → `settle_bill(payment)`. `create_order` stays for pay-now and the SDK. |
| Prices, discounts | snapshot at sale | snapshot **per line when it is added** (what the guest was told). |
| Service, PB1, rounding | on the order | on the **whole bill at settle**, on aggregates (D13), so paying at the end = paying at once. `pos.ts` mirrors it. |
| Kitchen | one ticket per order, "done" per order | one ticket **per round**; done per round. The kitchen screen groups by table. |
| Printing | receipt + kitchen | + kitchen ticket per round, + **pre-bill ("check")** before paying → **bridge update** on each print device (new print kind). |
| Removing items | voids: manager, same day, whole order (D11) | Before a round is sent: anyone. **After it's sent to the kitchen: manager + reason, audited.** This is the usual way staff steal at table restaurants. |
| Business day | day of sale | **day the bill is paid** (the cash lands in that day's drawer); a bill still open at the day's cutoff shows a warning. |
| Idempotency (D10) | per order | per round and per settle (a double tap never adds twice). |
| Two waiters, one table | n/a | the bill row is locked while a round is added; rounds just pile up. |
| Queue number (D35) | daily customer number | the table number takes its place; takeaway keeps the queue number. |
| Reports | per order | the same, plus covers (guests) and time seated, later. |

## Phases

1. **Core (about 2–3× the discounts work):** floor plan editor, open bill
   on a table, add rounds, kitchen ticket per round, remove a sent item
   (manager), move to another table, settle (cash/QRIS as today), open
   tables shown live on the plan (occupied / bill printed / time seated).
2. **Paper:** pre-bill print plus the bridge update.
3. **Later, only if asked:** split a bill (by item or evenly), merge
   tables, transfer items between tables, guest count, QR self-order at
   the table.

Split bill is the hardest part: payments, tax rounding per part, and
receipts. It's worth shipping phase 1 without it and seeing whether
Kawa asks for it.

## Questions before building

1. Who takes the order at the table: waiters on their own phones/iPads
   (each must be a registered terminal with PIN sign-in, P25), or always
   at the main till?
2. Does Kawa need split bill on day one?
3. Pay at the end only, or also "pay first, then sit" at the same branch?
   (The plan above allows both.)
4. Business day = day paid (recommended) or day the bill was opened?
