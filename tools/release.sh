#!/usr/bin/env bash
# Builds the app and publishes it. The website and the update check in the app
# both load .../releases/latest/download/cube-vault.apk, so the file has to
# carry that name.
set -euo pipefail

tag="v$(grep '^version:' pubspec.yaml | sed 's/version: //; s/+.*//')"
notes="${1:-}"

fvm flutter build apk --release
cp build/app/outputs/flutter-apk/app-release.apk build/cube-vault.apk

# Android refuses a build number below the installed one. The releases run in
# the 2000s (2016 was v0.4.2), so keep counting there.
aapt2="$HOME/Library/Android/sdk/build-tools/36.1.0/aapt2"
[ -x "$aapt2" ] && "$aapt2" dump badging build/cube-vault.apk | head -1

git tag "$tag"
git push origin "$tag"
gh release create "$tag" build/cube-vault.apk --title "Cube Vault $tag" \
  ${notes:+--notes "$notes"} ${notes:+} ${notes:--notes "Siehe Commits."}
