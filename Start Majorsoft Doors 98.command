#!/bin/bash
# Double-click in Finder to start Majorsoft Doors 98 in your browser.
cd "$(dirname "$0")" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Install it with:  brew install node"
  read -r -p "Press Return to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies…"
  npm install || { read -r -p "npm install failed. Press Return to close."; exit 1; }
fi

echo "Starting Majorsoft Doors 98 — close this window to shut it down."
npm run dev -- --open
