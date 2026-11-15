#!/usr/bin/env bash
# Build the iPhone app and send it to App Store Connect, from where it goes to
# TestFlight and, once submitted, to App Review.
#
#   scripts/ios-release.sh TEAMID
#
# TEAMID is the 10-character Team ID from developer.apple.com → Membership.
# Xcode must be signed in to that team (Xcode → Settings → Accounts), and the
# app must exist in App Store Connect with the bundle id com.crumbsup.app.
# Build numbers go up by themselves (manageAppVersionAndBuildNumber).
set -euo pipefail

team="${1:?Usage: scripts/ios-release.sh TEAMID}"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
cd "$(dirname "$0")/.."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "› Building the site and copying it into the app"
npm run build
npx cap sync ios

echo "› Archiving"
# Unsigned here: automatic signing would sign the archive for development,
# which needs an iPhone registered to the team. The export below signs it for
# the App Store instead, which doesn't.
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$work/CrumbsUp.xcarchive" \
  DEVELOPMENT_TEAM="$team" \
  CODE_SIGNING_ALLOWED=NO \
  archive

echo "› Signing for the App Store and uploading"
plist="$work/ExportOptions.plist"
cp ios/ExportOptions.plist "$plist"
/usr/libexec/PlistBuddy -c "Add :teamID string $team" "$plist"
xcodebuild \
  -exportArchive \
  -archivePath "$work/CrumbsUp.xcarchive" \
  -exportOptionsPlist "$plist" \
  -exportPath "$work/export" \
  -allowProvisioningUpdates

echo "✓ Uploaded. It shows up in App Store Connect → TestFlight once Apple has processed it (10–30 minutes)."
