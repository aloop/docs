#!/usr/bin/env bash

set -euo pipefail

shopt -s globstar

if hugo --gc --minify --cleanDestinationDir=true; then
  # Try to compress the files ahead of time so the webserver can do less work
  for uncompressed_file in public/**/*.{html,css,js,mjs,json,svg,xml}; do
    if [ -e "$uncompressed_file" ] && [ ! -d "$uncompressed_file" ]; then
      if command -v brotli > /dev/null 2>&1; then
        brotli --keep --best "$uncompressed_file"
      fi

      if command -v gzip > /dev/null 2>&1; then
        gzip --keep --best "$uncompressed_file"
      fi
    fi
  done
fi
