#!/bin/bash
# Normalize smoke and k6 results into a single analysis format.

set -e

node scripts/export-results.js "$@"
