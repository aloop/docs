#!/usr/bin/env bash

set -euo pipefail

hugo server --cleanDestinationDir --gc --noHTTPCache
