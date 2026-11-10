#!/bin/bash
#
# Builds Sienna.app.
#
#   ./scripts/build.sh              # build into ./build/Sienna.app
#   ./scripts/build.sh --install    # build and copy into /Applications
#   ./scripts/build.sh --run        # build and launch
#   ./scripts/build.sh --debug      # debug build
#
# Ad-hoc signed with the hardened runtime (set SIGN_IDENTITY to use a real certificate).
# Permissions granted to the app are tied to the signature, so a rebuild may need them re-granted.

set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="Sienna"
BUNDLE_ID="com.local.sienna"
VERSION="0.1.0"
BUILD_NUMBER="1"
MIN_MACOS="14.0"

CONFIG="release"
INSTALL=0
RUN=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --run) RUN=1 ;;
    --debug) CONFIG="debug" ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: the app can only be built on macOS (AppKit/SceneKit). 'swift test' works anywhere." >&2
  exit 1
fi

echo "==> Compiling ($CONFIG)"
swift build -c "$CONFIG" --product "$APP_NAME"
BIN_PATH="$(swift build -c "$CONFIG" --show-bin-path)/$APP_NAME"

APP_DIR="build/$APP_NAME.app"
echo "==> Assembling $APP_DIR"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/$APP_NAME"
[[ -f assets/AppIcon.icns ]] && cp assets/AppIcon.icns "$APP_DIR/Contents/Resources/AppIcon.icns"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>$APP_NAME</string>
    <key>CFBundleDisplayName</key><string>$APP_NAME</string>
    <key>CFBundleExecutable</key><string>$APP_NAME</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
    <key>LSMinimumSystemVersion</key><string>$MIN_MACOS</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>LSUIElement</key><true/>
    <key>NSAppleEventsUsageDescription</key><string>Sienna controls Kaset (play, pause, skip, like, now playing) through AppleScript.</string>
</dict>
</plist>
PLIST

# Ad-hoc signature (no paid Apple Developer account needed) with the hardened runtime on, so the
# binary refuses injected libraries and unsigned executable memory. SIGN_IDENTITY can name a real
# certificate instead. A failed or invalid signature stops the build.
SIGN_IDENTITY="${SIGN_IDENTITY:--}"
echo "==> Signing (${SIGN_IDENTITY/#-/ad-hoc}, hardened runtime)"
codesign --force --options runtime --entitlements assets/Sienna.entitlements \
  --sign "$SIGN_IDENTITY" --timestamp=none "$APP_DIR"
codesign --verify --strict --verbose=2 "$APP_DIR"

echo "==> Built $APP_DIR"

if [[ $INSTALL -eq 1 ]]; then
  if [[ -w /Applications ]]; then
    rm -rf "/Applications/$APP_NAME.app"
    cp -R "$APP_DIR" /Applications/
    APP_DIR="/Applications/$APP_NAME.app"
    echo "==> Installed to $APP_DIR"
  else
    echo "warning: /Applications is not writable; leaving the app in ./build" >&2
  fi
fi

if [[ $RUN -eq 1 ]]; then open "$APP_DIR"; fi
