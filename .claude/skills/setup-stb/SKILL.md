---
name: setup-stb
description: Set up a new (or reset) STB print bridge box for receipt printing. Use when the user says /setup-stb or asks to set up a new printer box.
---

Runbook: `logs/operations.md` → "New STB — who does what". Bridge details:
`bridge/README.md`. Follow that split exactly — the user does only hands-on
and password steps; you do everything else. Don't make them do work you can do.

## First reply
Ask how far they are, and show only their part, in plain words:

1. Plug in: power, LAN cable to the router, printer by USB, paper in.
   (Armbian already flashed.) Tell me when it's on.
2. I'll find the box and give you its IP.
3. You type: `ssh root@<ip>`, set a password, type `exit`, then
   `ssh-copy-id root@<ip>`. Tell me "done".
4. Token: say whether I should get it from Settings → Printers in Chrome,
   or you'll paste it into the file yourself.
5. When I say ready: do one small test payment and check the paper.
6. Later: reserve the IP on the modem (I'll give you the MAC).

If they say they've already done some of it, skip ahead.

## Your part
- Find the box: `arp -a`, ping sweep of the Mac's subnet, look for an
  Armbian hostname / new MAC. Old FOKAS box was `192.168.100.x` on the ISP
  modem.
- After key access works (`ssh -o BatchMode=yes root@<ip> true`): timezone,
  Node 24 via NodeSource, rsync, check `/dev/usb/lp0`, then the install
  block from `bridge/README.md`.
- Never ask for the root password. Check status once, don't poll in loops.
- Finish: record hostname, IP, MAC and printer device in `logs/operations.md`.
