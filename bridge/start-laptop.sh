#!/bin/sh
# Mac/Linux laptop stand-in for the STB. Reads settings from .env next to
# this file. `caffeinate` keeps a Mac awake while it runs (a sleeping laptop
# prints nothing). Stop with Ctrl+C.
cd "$(dirname "$0")" || exit 1
[ -f .env ] || { echo "Missing .env — copy .env.example to .env and fill it in."; exit 1; }
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -is node --env-file=.env index.mjs
fi
exec node --env-file=.env index.mjs
