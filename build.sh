#!/usr/bin/env bash

set -eEuo pipefail

shopt -s globstar

echo "Installing npm packages..."
NODE_ENV=production npm ci

if HUGO_ENV=production hugo --gc --minify --cleanDestinationDir=true; then
  # Try to compress the files ahead of time so the webserver can do less work
  for uncompressed_file in dist/**/*.{html,css,js,mjs,json,svg,xml}; do
    if [ -e "$uncompressed_file" ] && [ ! -d "$uncompressed_file" ]; then
      if command -v brotli > /dev/null 2>&1; then
        brotli --keep --best "$uncompressed_file"
      fi

      if command -v gzip > /dev/null 2>&1; then
        gzip --keep --best "$uncompressed_file"
      fi
    fi
  done

  if [ -d public ]; then
    mv -v public public.old
    mv -v dist public
    rm -rf public.old
  else
    mv -v dist public
  fi
fi
