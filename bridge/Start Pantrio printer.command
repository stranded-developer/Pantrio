#!/bin/sh
# Double-click to start. Keep this window open; close it to stop printing.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Get the LTS installer from https://nodejs.org, install it, then double-click this file again."
  read -r _; exit 1
fi

if grep -q '^PRINT_DEVICE_TOKEN=$' .env; then
  echo "Missing printer key. Open the .env file in this folder and paste the token"
  echo "from Pantrio → FOKAS → Settings → Printers → Add printer."
  echo "(To open it: in Terminal run   open -e \"$PWD/.env\"  )"
  read -r _; exit 1
fi

if grep -q '^PRINTER=dry-run' .env; then
  echo "PRINTER is still dry-run (receipts show here instead of paper). Printers on this Mac:"
  lpstat -p 2>/dev/null | sed -n 's/^printer \([^ ]*\).*/   cups:\1/p'
  echo "Put the receipt printer's line into .env as  PRINTER=cups:<name>  to print on paper."
  echo
fi

echo "Starting Pantrio print bridge — this Mac stays awake while this window is open."
exec caffeinate -is node --env-file=.env index.mjs
