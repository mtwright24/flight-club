#!/usr/bin/env sh
# Run the dev client on an iOS Simulator by *name* (not a cached UDID).
# Fixes: xcodebuild error 70 "Unable to find a destination matching ... id=..."
# when a previously selected simulator runtime was removed or Xcode caches a bad UDID.
#
# Override the simulator name if needed, e.g.:
#   EXPO_IOS_SIMULATOR="iPhone Air" npm run ios:sim
set -eu
NAME="${EXPO_IOS_SIMULATOR:-iPhone 17}"
exec npx expo run:ios -d "$NAME" "$@"
