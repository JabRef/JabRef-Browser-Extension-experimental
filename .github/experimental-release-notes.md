Rolling build of the [`experimental`](https://github.com/JabRef/JabRef-Browser-Extension-experimental/tree/experimental) branch. The zip files below are refreshed on every push to that branch; the tag itself does not track the built commit.

## Install in Chrome / Edge / Vivaldi

Chrome refuses extension packages from outside the Web Store, so the build is loaded unpacked:

1. Download `jabref-experimental-chrome.zip` and unpack it into a folder you keep around.
2. Open `chrome://extensions` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the unpacked folder.

The extension id stays `bifehkofibaamoeaopjglfkddgkijdlh` (pinned via `manifest.key`), so the native-messaging bridge and JabRef integration behave exactly like a store install.

## Install in Firefox

Release Firefox only keeps AMO-signed extensions installed permanently. For testing:

1. Download `jabref-experimental-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select the zip.

The temporary install lasts until Firefox restarts.
