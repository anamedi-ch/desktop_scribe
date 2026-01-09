#!/bin/bash

# Script to commit changes, push to GitHub, create a tag, and trigger release build

set -e

echo "📦 Staging all changes..."
git add -A

echo "📝 Checking git status..."
git status --short

echo ""
read -p "Enter commit message (or press Enter for default): " COMMIT_MSG
COMMIT_MSG=${COMMIT_MSG:-"feat: Add custom shortcut, recording duration, summary templates, and update support links"}

echo "💾 Committing changes..."
git commit -m "$COMMIT_MSG"

echo "📤 Pushing to GitHub..."
git push

echo ""
read -p "Enter version tag (e.g., v0.0.7, or press Enter to use current Cargo.toml version): " VERSION_TAG

if [ -z "$VERSION_TAG" ]; then
    # Extract version from Cargo.toml
    VERSION=$(grep "^version" desktop/src-tauri/Cargo.toml | cut -d'"' -f2)
    VERSION_TAG="v${VERSION}"
fi

echo "🏷️  Creating and pushing tag: $VERSION_TAG"
git tag -a "$VERSION_TAG" -m "Release $VERSION_TAG"
git push origin "$VERSION_TAG"

echo ""
echo "✅ Done! Tag $VERSION_TAG has been pushed."
echo ""
echo "🚀 To build binaries, go to GitHub Actions and trigger the 'Release' workflow manually,"
echo "   or wait for it to trigger automatically if configured."

