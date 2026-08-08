#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
mkdir -p public/images
curl --config scripts/assets.curl

printf 'Downloaded %s site assets.\n' "$(find public/images -type f | wc -l | tr -d ' ')"
