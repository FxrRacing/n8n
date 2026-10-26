#!/usr/bin/env bash
# Pull the latest upstream n8n into our fxr branch.
#   master  = untouched mirror of n8n-io/n8n master
#   fxr     = master + FXR changes (deployed to Azure)
set -euo pipefail
git fetch upstream master
git checkout master && git merge --ff-only upstream/master && git push origin master
git checkout fxr && git merge master -m "chore: sync upstream n8n $(git rev-parse --short upstream/master)"
echo "Merged. Resolve conflicts if any, then: git push origin fxr"
