#!/usr/bin/env bash
# FXR: deploy (or update) an Ollama Container App next to n8n.
#
# Runs in the same resource group and Container Apps environment as n8n-app so n8n can reach
# Ollama over the environment's private network. Ingress is internal only: nothing outside the
# environment can call it. Pulled models live on an Azure Files share mounted at /root/.ollama so
# they survive restarts and image updates.
#
# Requires: az CLI logged in with rights on the resource group. Idempotent: re-run to change
# models, size, or image.
set -euo pipefail

RG="${RG:-n8n-rg}"
N8N_APP="${N8N_APP:-n8n-app}"             # used to discover the environment
APP="${APP:-ollama}"
IMAGE="${IMAGE:-ollama/ollama:latest}"      # pin a tag once you have a known-good version
MODELS="${MODELS:-llama3.2:3b}"             # space separated, pulled on every start if missing
CPU="${CPU:-4}"                             # Consumption profile max is 4 vCPU / 8Gi
MEMORY="${MEMORY:-8Gi}"
WORKLOAD_PROFILE="${WORKLOAD_PROFILE:-Consumption}"  # e.g. a GPU profile name added to the env
SHARE_QUOTA_GIB="${SHARE_QUOTA_GIB:-100}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-}"      # defaults to a name derived from the subscription
SHARE="${SHARE:-ollama-models}"
ENV_STORAGE="${ENV_STORAGE:-ollama-models}" # name of the storage link on the environment
TAGS="${TAGS:-app=ollama owner=fxr}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n==> %s\n' "$*"; }

log "Resolving the Container Apps environment from $N8N_APP"
ENV_ID="$(az containerapp show -g "$RG" -n "$N8N_APP" --query properties.environmentId -o tsv)"
ENV_NAME="${ENV_ID##*/}"
LOCATION="$(az containerapp env show --ids "$ENV_ID" --query location -o tsv | tr -d ' ' | tr '[:upper:]' '[:lower:]')"
DEFAULT_DOMAIN="$(az containerapp env show --ids "$ENV_ID" --query properties.defaultDomain -o tsv)"
echo "environment: $ENV_NAME ($LOCATION)"

if [[ -z "$STORAGE_ACCOUNT" ]]; then
  SUB_HASH="$(az account show --query id -o tsv | tr -d '-' | cut -c1-8)"
  STORAGE_ACCOUNT="fxrollama${SUB_HASH}"
fi

log "Ensuring storage account $STORAGE_ACCOUNT and file share $SHARE"
if ! az storage account show -g "$RG" -n "$STORAGE_ACCOUNT" >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  az storage account create -g "$RG" -n "$STORAGE_ACCOUNT" -l "$LOCATION" \
    --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 \
    --allow-blob-public-access false --tags $TAGS -o none
fi
STORAGE_KEY="$(az storage account keys list -g "$RG" -n "$STORAGE_ACCOUNT" --query '[0].value' -o tsv)"
az storage share-rm create --storage-account "$STORAGE_ACCOUNT" -g "$RG" -n "$SHARE" \
  --quota "$SHARE_QUOTA_GIB" -o none

log "Linking the share to the environment as $ENV_STORAGE"
# Azure only allows the key to change on an existing link, so create it once and leave it alone.
if az containerapp env storage show -g "$RG" -n "$ENV_NAME" --storage-name "$ENV_STORAGE" >/dev/null 2>&1; then
  echo "already linked"
else
  az containerapp env storage set -g "$RG" -n "$ENV_NAME" --storage-name "$ENV_STORAGE" \
    --azure-file-account-name "$STORAGE_ACCOUNT" --azure-file-account-key "$STORAGE_KEY" \
    --azure-file-share-name "$SHARE" --access-mode ReadWrite -o none
fi

log "Rendering app spec"
SPEC="$(mktemp)"
trap 'rm -f "$SPEC"' EXIT
sed \
  -e "s|__ENV_ID__|$ENV_ID|g" \
  -e "s|__LOCATION__|$LOCATION|g" \
  -e "s|__IMAGE__|$IMAGE|g" \
  -e "s|__MODELS__|$MODELS|g" \
  -e "s|__CPU__|$CPU|g" \
  -e "s|__MEMORY__|$MEMORY|g" \
  -e "s|__WORKLOAD_PROFILE__|$WORKLOAD_PROFILE|g" \
  -e "s|__ENV_STORAGE__|$ENV_STORAGE|g" \
  "$here/containerapp.yaml" > "$SPEC"

if az containerapp show -g "$RG" -n "$APP" >/dev/null 2>&1; then
  log "Updating $APP"
  az containerapp update -g "$RG" -n "$APP" --yaml "$SPEC" -o none
else
  log "Creating $APP"
  az containerapp create -g "$RG" -n "$APP" --yaml "$SPEC" -o none
fi
# shellcheck disable=SC2086
az containerapp update -g "$RG" -n "$APP" --set-env-vars "OLLAMA_PULL_MODELS=$MODELS" -o none
# shellcheck disable=SC2086
az resource tag --ids "$(az containerapp show -g "$RG" -n "$APP" --query id -o tsv)" --tags $TAGS -o none

FQDN="$APP.internal.$DEFAULT_DOMAIN"
log "Done"
cat <<MSG
Ollama is reachable from apps in the environment only:

  http://$FQDN

In n8n create an Ollama credential with that as the Base URL (API key empty).
Models requested: $MODELS (pulled in the background on first start; watch progress with
  az containerapp logs show -g $RG -n $APP --follow)
MSG
