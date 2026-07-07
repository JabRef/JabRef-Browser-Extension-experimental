#!/usr/bin/env bash
#
# Linux installer for the JabRef Browser-Extension fulltext bridge.
# Registers the native-messaging manifest for every locally-installed
# Chromium / Firefox browser.
#
# Usage:
#   ./install.sh [--bridge-path <path>]
#
# Defaults: bridge-path = ../build/jabext-bridge (next to install.sh)

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"

bridge_path="$repo/build/jabext-bridge"

while [ $# -gt 0 ]; do
  case "$1" in
    --bridge-path) bridge_path="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ ! -x "$bridge_path" ]; then
  echo "error: bridge binary missing at $bridge_path (run 'bridge/build.sh' first)" >&2
  exit 1
fi

install_firefox() {
  local out="$1"
  mkdir -p "$out"
  sed "s|@BRIDGE_PATH@|$bridge_path|g" "$repo/native-messaging/firefox.json.template" \
      > "$out/jabext_bridge.json"
  chmod 600 "$out/jabext_bridge.json"
  echo "[install] firefox: $out/jabext_bridge.json"
}

install_chromium() {
  local out="$1"
  mkdir -p "$out"
  sed "s|@BRIDGE_PATH@|$bridge_path|g" "$repo/native-messaging/chromium.json.template" \
      > "$out/jabext_bridge.json"
  chmod 600 "$out/jabext_bridge.json"
  echo "[install] chromium: $out/jabext_bridge.json"
}

# Firefox + forks.
install_firefox "$HOME/.mozilla/native-messaging-hosts"
install_firefox "$HOME/.librewolf/native-messaging-hosts"

# Chromium family.
install_chromium "$HOME/.config/google-chrome/NativeMessagingHosts"
install_chromium "$HOME/.config/chromium/NativeMessagingHosts"
install_chromium "$HOME/.config/microsoft-edge/NativeMessagingHosts"
install_chromium "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
install_chromium "$HOME/.config/vivaldi/NativeMessagingHosts"

echo "[install] done. Reload the JabRef Browser Extension to launch the bridge."
