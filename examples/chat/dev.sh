#!/usr/bin/env bash
cd "$(dirname "$0")"
set -e

DEV=1 deno run \
  --watch \
  --allow-net \
  --allow-env \
  --allow-read \
  --allow-write=./assets \
  main.ts