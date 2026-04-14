#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Push Worker secrets to Cloudflare from values in .env
#
# Usage:
#     ./scripts/push-secrets.sh              # push all
#     ./scripts/push-secrets.sh ANTHROPIC    # push only matching keys
# -----------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Error: .env not found. Copy .env.example to .env and fill in values." >&2
  exit 1
fi

# Load .env into the shell (variables become available to child processes)
set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN is empty in .env" >&2
  exit 1
fi

# Which secrets we manage here. Add more rows as needed.
SECRETS=(
  ANTHROPIC_API_KEY
  DEEPSEEK_API_KEY
)

FILTER="${1:-}"

for KEY in "${SECRETS[@]}"; do
  if [[ -n "$FILTER" && "$KEY" != *"$FILTER"* ]]; then
    continue
  fi

  VALUE="${!KEY:-}"
  if [[ -z "$VALUE" ]]; then
    echo "skip $KEY (empty in .env)"
    continue
  fi

  echo "push $KEY"
  # printf without a trailing newline; wrangler reads the secret from stdin
  printf '%s' "$VALUE" | npx wrangler secret put "$KEY"
done

echo
echo "Done. Verify with: npx wrangler secret list"
