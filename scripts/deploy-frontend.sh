#!/usr/bin/env bash
# Build the frontend against the deployed API and publish it to the
# CloudFront-backed S3 bucket created by Terraform.
#
# Usage:
#   AWS_PROFILE=your-profile ./scripts/deploy-frontend.sh
#
# Reads all AWS-specific values from `terraform output` — nothing is
# hardcoded, so this works for any account/region you deploy to.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
WEB_DIR="$ROOT/web"

echo "› Reading Terraform outputs…"
API_BASE="$(terraform -chdir="$TF_DIR" output -raw api_base_url)"
BUCKET="$(terraform -chdir="$TF_DIR" output -raw frontend_bucket)"
SITE_URL="$(terraform -chdir="$TF_DIR" output -raw site_url)"
# Only present in cloudfront hosting mode.
DIST_ID="$(terraform -chdir="$TF_DIR" output -raw cloudfront_distribution_id 2>/dev/null || true)"

echo "  API_BASE = $API_BASE"
echo "  BUCKET   = $BUCKET"

echo "› Building frontend…"
(
  cd "$WEB_DIR"
  npm ci 2>/dev/null || npm install
  VITE_API_BASE="$API_BASE" \
  VITE_BRAND_PRIMARY="${VITE_BRAND_PRIMARY:-Black}" \
  VITE_BRAND_ACCENT="${VITE_BRAND_ACCENT:-Cherry}" \
  VITE_CTA_URL="${VITE_CTA_URL:-example.com}" \
  VITE_EVENT_LABEL="${VITE_EVENT_LABEL:-AI for Everyone}" \
    npm run build
)

echo "› Syncing to s3://$BUCKET …"
# Hashed assets: long cache. index.html: no cache so new deploys show up.
aws s3 sync "$WEB_DIR/dist/" "s3://$BUCKET/" --delete \
  --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp "$WEB_DIR/dist/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache"

if [ -n "${DIST_ID:-}" ] && [ "$DIST_ID" != "null" ]; then
  echo "› Invalidating CloudFront…"
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null
fi

echo "✓ Deployed: $SITE_URL"
