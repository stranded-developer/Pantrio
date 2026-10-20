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
# LOGO=/opt/pantrio-bridge/logo.pbm   optional, 1-bit PBM
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

## Moving FOKAS's box over (later)

FOKAS's STB keeps running the FOKAS bridge against the FOKAS database until
the cutover. On cutover day: add a printer in Pantrio, install this folder
next to the old one, write the new env file, `systemctl disable --now
focas-bridge`, enable `pantrio-bridge`. The old `/etc/focas-bridge.env`
holds FOKAS's secret key — delete it once FOKAS is retired.
