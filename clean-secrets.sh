#!/usr/bin/env bash
# Removes apps/api/env.production from all git history and force-pushes.
# Run from the repo root: bash clean-secrets.sh
#
# Prerequisites:
#   pip install git-filter-repo   (or: brew install git-filter-repo)
#
# IMPORTANT: rotate all leaked secrets BEFORE running this.
# Anyone who already cloned the repo has them in their local history.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> Checking git-filter-repo is installed..."
if ! command -v git-filter-repo &>/dev/null; then
  echo "ERROR: git-filter-repo not found."
  echo "Install it with:  pip install git-filter-repo"
  exit 1
fi

echo "==> Removing apps/api/env.production from all history..."
git filter-repo --path apps/api/env.production --invert-paths --force

echo "==> Re-adding remote origin (filter-repo removes it as a safety measure)..."
git remote add origin https://github.com/Dudifer/ApComp-Application-Companion-.git

echo "==> Force-pushing cleaned history to origin/main..."
git push origin setup-aws-deployment --force

echo ""
echo "Done. The file is gone from GitHub history."
echo ""
echo "Next steps:"
echo "  1. Go to GitHub → Settings → Branches and make sure no branch protection blocks force-push."
echo "     If needed, temporarily disable it, push, then re-enable."
echo "  2. Anyone else who has cloned the repo needs to re-clone (their local history still has the secrets)."
echo "  3. Delete and re-add any deploy keys or CI secrets that referenced the old values."
