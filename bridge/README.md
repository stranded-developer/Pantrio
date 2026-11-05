# Pantrio print bridge

Runs on a small box at the restaurant (STB on Armbian, Raspberry Pi, old
laptop) and prints receipts from Pantrio's print queue. Ported from the FOKAS
bridge; the difference is how it signs in.

**It never holds the Supabase secret key.** It holds a *device token* from
Settings → Printers, which can only claim, read and finish print jobs for its
own branch (logs/decisions.md P18). Lost box → Revoke in Settings.

```
till pays → create_order() queues a print job (same transaction)
          → bridge polls device_claim_print_jobs() every 3 s
          → device_receipt_data() → ESC/POS → printer
          → device_finish_print_job()
```

No dependencies — Node 22+ built-ins only.

## Settings — `/etc/pantrio-bridge.env` (root-only)

Settings → Printers → Add printer shows these lines with the token filled in:

```
PANTRIO_SUPABASE_URL=https://<ref>.supabase.co
PANTRIO_PUBLISHABLE_KEY=sb_publishable_...
PRINT_DEVICE_TOKEN=pdt_...
PRINTER=usb:/dev/usb/lp0          # or tcp://192.168.1.50  or  dry-run
RECEIPT_WIDTH=32                  # 58mm paper = 32, 80mm = 48
# LOGO=auto (default): the receipt logo set in Settings → Logo
# LOGO=none: no logo · LOGO=/path/logo.pbm: a local file instead
# POLL_MS=3000
```

`PRINTER=dry-run` prints the receipt to the log instead of paper — use it to
test a new token from any computer: `node index.mjs`.

## Install / update (from a Mac on the restaurant network)

```bash
rsync -a --delete bridge/ root@<box-ip>:/opt/pantrio-bridge/
ssh root@<box-ip> '
  id pantrio-bridge >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin pantrio-bridge
  cp /opt/pantrio-bridge/pantrio-bridge.service /etc/systemd/system/
  chmod 600 /etc/pantrio-bridge.env
  systemctl daemon-reload && systemctl enable --now pantrio-bridge && systemctl restart pantrio-bridge'
```

Logs: `journalctl -u pantrio-bridge -f`.

## Laptop instead of the STB (temporary)

Any laptop on the restaurant Wi-Fi can stand in — the bridge only needs
internet. Same printer key, same receipts. It must stay **on, awake and
plugged in**: a sleeping laptop prints nothing (receipts wait up to 15
minutes, then can be reprinted from the order screen).

**Mac** (simplest):
1. Put this folder anywhere — e.g. your home folder, named `pantrio-bridge`.
2. Install **Node** (LTS installer from nodejs.org).
3. System Settings → Printers & Scanners → **Add Printer** → pick the USB
   receipt printer (e.g. "USB 58series2", Kind: USB) → Use: **Generic
   PostScript Printer** → Add. (The bridge prints raw; the driver is unused.)
4. Open the hidden `.env` file in this folder (Terminal:
   `open -e ~/pantrio-bridge/.env`; or copy `.env.example` to `.env` first)
   and paste the token from Pantrio → Settings → Printers → Add printer.
5. Double-click **`Start Pantrio printer.command`**. While `PRINTER=dry-run`
   it lists the Mac's printers (`cups:USB_58series2` style) — put that line
   into `.env` as `PRINTER=…`, close the window, double-click again.
   Leave the window open; it keeps the Mac awake and logs each receipt.

**Windows:** install the printer, share it as `receipt`, copy `.env.example`
to `.env`, paste the three lines from Settings → Printers, set
`PRINTER=windows:receipt`, double-click `start-laptop.cmd`, and set Power &
sleep to *Never*.

Moving to the STB later: add a new printer key for the STB, set it up as
below, then **Revoke** the laptop's key in Settings → Printers.

## Moving FOKAS's box over (later)

FOKAS's STB keeps running the FOKAS bridge against the FOKAS database until
the cutover. On cutover day: add a printer in Pantrio, install this folder
next to the old one, write the new env file, `systemctl disable --now
focas-bridge`, enable `pantrio-bridge`. The old `/etc/focas-bridge.env`
holds FOKAS's secret key — delete it once FOKAS is retired.
