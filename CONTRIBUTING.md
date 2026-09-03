## Contributing to the Development

JabRef browser extension uses the [WebExtensions API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

Preparation:

1. Install [Node.js](https://nodejs.org) (e.g., `choco install nodejs`) and [pnpm](https://pnpm.io) (e.g., `npm install -g pnpm`).
2. [Fork the repository](https://help.github.com/articles/fork-a-repo/).
3. Checkout the repository.
4. Call `git submodule update --init` to ensure all submodules are checked out, too.
5. Install development dependencies via `pnpm install`.
6. Start browser with the add-on activated:
   Firefox: `pnpm dev:firefox`
   Chrome: `pnpm dev:chrome`
   Opera: `pnpm dev:opera`
   Edge: `pnpm dev:edge`
   Safari: `pnpm build:safari` (macOS with Xcode required)

Safari builds are available for local development via WXT (macOS with Xcode required):

1. Run `pnpm dev:safari` to build the Safari development target.
2. Run `pnpm prepare:safari` to generate the Xcode project in `dist/safari/` through [`wxt-module-safari-xcode`](https://github.com/rxliuli/wxt-module-safari-xcode).
3. Open:
   `dist/safari/JabRef Browser Extension.xcodeproj`
4. Run the `JabRef Browser Extension` scheme in Xcode.
5. Enable the extension in Safari Settings.

For local Apple packaging, run `pnpm build:safari` to produce `dist/safari/JabRef Browser Extension.app`. WXT builds the extension bundle, and `wxt-module-safari-xcode` converts it into the Xcode project and macOS app structure Apple expects. Optional Developer ID signing and notarization commands are:

1. `pnpm sign:safari-local IDENTITY="Developer ID Application: Your Name (TEAMID)"`
2. `pnpm notarize:safari-local PROFILE="profile-name"`

For direct distribution, the containing app remains unsandboxed so its native-message handler can launch a separately installed JabRef app. The embedded Safari extension is sandboxed, as required by PlugInKit. The App Store artifact follows a separate, sandboxed signing path.

### Native messaging in local Chrome development

The development build uses the stable Chrome extension ID, so the JabRef native-host manifest already authorizes it. On macOS, if Chrome reports `Specified native messaging host not found.`, refresh the system manifest from the installed JabRef application:

```sh
sudo cp "/Applications/JabRef.app/Contents/Resources/native-messaging-host/chromium/org.jabref.jabref.json" \
  "/Library/Google/Chrome/NativeMessagingHosts/org.jabref.jabref.json"
```

Restart Chrome after updating the manifest. If JabRef is not installed in `/Applications`, update the source path accordingly.

Then follow the usual steps to [contribute code](https://guides.github.com/activities/contributing-to-open-source/#contributing):

1. Create your feature branch: `git checkout -b my-new-feature`
2. Make your changes and test them by running the extension in the browser as described above.
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request.

## Side-loading into an existing Firefox profile

`pnpm dev:firefox` launches Firefox with a fresh, temporary profile, which carries no existing logins or cookies. Testing against sites that require an authenticated session (for example, paywalled PDFs) requires side-loading the build into an existing profile instead:

1. Run `pnpm dev:firefox` and leave it running; the temporary-profile window it opens is not used for this. It builds to `.output/firefox-mv3-dev/` and rebuilds on save.
2. In the target Firefox profile, open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `.output/firefox-mv3-dev/manifest.json`.

The add-on then runs in that profile, and WXT's auto-reload refreshes it on save. Temporary add-ons are removed when Firefox restarts.

For a static build without auto-reload, run `pnpm build:firefox`, load `.output/firefox-mv3/manifest.json` the same way, and click **Reload** on the add-on card after each rebuild.

To persist the add-on across restarts, build a package with `pnpm zip:firefox` (`.output/*-firefox.zip`) and install it in Firefox Developer Edition, Nightly, or ESR after setting `xpinstall.signatures.required = false` in `about:config` (`about:addons` → gear → **Install Add-on From File…**). Release Firefox rejects unsigned add-ons.

### Registering the fulltext native-messaging host

Side-loading the extension is sufficient for most development. Exercising JabRef's fulltext fetcher additionally requires the native-messaging host to be registered. The host is maintained in the JabRef repository under [`browser-bridge/`](https://github.com/JabRef/jabref/tree/main/browser-bridge) and ships as a script (no build step). From a JabRef checkout, on Linux:

```sh
./browser-bridge/install/install.sh   # register the native-messaging manifest
```

The Firefox extension id (`@jabfox`) is pinned in `wxt.config.ts`, so the host's native-messaging manifest also matches a side-loaded build.

The manifest stores an absolute path to the host script; after moving or re-cloning the JabRef checkout, re-run the installer. If JabRef does not list the extension under **External Fetchers**, see [Troubleshooting](README.md#troubleshooting-extension-missing-under-external-fetchers) in the README.

## Updating dependencies & Zotero translators

- `python scripts/import_and_patch_translators.py` updates all Zotero submodules, post-processes the translators and applies the necessary patches for our extension

The following commands are used to update the dependencies of the project; as we use Renovate for automatic dependency updates this should not be necessary in most cases, but it is good to know how to do it manually:

- `pnpm outdated` gives an overview of outdated packages ([doc](https://pnpm.io/cli/outdated))
- `pnpm update --latest` updates all packages
- `pnpm install` installs updated packages

## Release of new version

- Increase version number in `package.json`
- `pnpm build`
- Upload to:
  - https://addons.mozilla.org/en-US/developers/addon/jabref/versions/submit/
  - https://chrome.google.com/u/2/webstore/devconsole/26c4c347-9aa1-48d8-8a22-1c79fd3a597e/bifehkofibaamoeaopjglfkddgkijdlh/edit/package
  - https://addons.opera.com/developer/upload/
  - https://developer.apple.com/app-store-connect/
- Remove the `key` field in `wxt.config.ts` and build again. Then upload to:
  - https://partner.microsoft.com/en-us/dashboard/microsoftedge/2045cdc1-808f-43c4-8091-43e2dcaff53d/packages

## Safari builds, CI, and distribution

The Safari publish job requires these GitHub Actions secrets:

- `APPLE_TEAM_ID`: Apple Developer team ID
- `APPLE_CERTIFICATE_BASE64`: base64-encoded `.p12` certificate containing the App Store signing identities
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12`
- `SAFARI_APP_SIGNING_IDENTITY`: full app signing identity, for example `3rd Party Mac Developer Application: JabRef e.V. (TEAMID)`
- `SAFARI_INSTALLER_SIGNING_IDENTITY`: full installer signing identity, for example `3rd Party Mac Developer Installer: JabRef e.V. (TEAMID)`
- `APPLE_MACOS_PROVISIONING_PROFILE_BASE64`: base64-encoded macOS App Store provisioning profile for the app bundle ID
- `APPLE_MACOS_EXTENSION_PROVISIONING_PROFILE_BASE64`: base64-encoded macOS App Store provisioning profile for the extension bundle ID
- `APPLE_API_KEY`: base64-encoded App Store Connect API key (`.p8`)
- `APPLE_API_KEY_ID`: App Store Connect API key ID
- `APPLE_API_ISSUER`: App Store Connect API issuer ID

The direct-distribution Safari artifact additionally requires:

- `APPLE_DEVELOPER_ID_CERTIFICATE_BASE64`: base64-encoded `.p12` certificate containing the Developer ID Application identity
- `APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD`: password for that `.p12`
- `SAFARI_DEVELOPER_ID_SIGNING_IDENTITY`: full Developer ID signing identity, for example `Developer ID Application: JabRef e.V. (TEAMID)`

The Apple Developer portal may label these certificates as `Apple Distribution`, `Mac App Distribution`, or `Mac Installer Distribution`, but the values used by `codesign` and `productbuild` must match the installed Keychain identity strings exactly.
