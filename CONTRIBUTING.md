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
   Safari: `pnpm safari:xcode` (macOS with Xcode required)

Safari local packaging flow:

1. Build and generate the Xcode project:
   `pnpm safari:xcode`
2. Open:
   `dist/safari/JabRef Browser Extension.xcodeproj`
3. Run the `JabRef Browser Extension` scheme in Xcode
4. Enable the extension in Safari Settings
5. Optional signing:
   `pnpm sign:safari-local IDENTITY="Developer ID Application: Your Name (TEAMID)"`
6. Optional notarization:
   `pnpm notarize:safari-local PROFILE="profile-name"`

### Native messaging in local Chrome development

The development build uses the stable Chrome extension ID, so the JabRef native-host manifest already authorizes it. On macOS, if Chrome reports `Specified native messaging host not found.`, refresh the system manifest from the installed JabRef application:

```sh
sudo cp "/Applications/JabRef.app/Contents/Resources/native-messaging-host/chromium/org.jabref.jabref.json" \
  "/Library/Google/Chrome/NativeMessagingHosts/org.jabref.jabref.json"
```

Restart Chrome after updating the manifest. If JabRef is not installed in `/Applications`, update the source path accordingly.

Now just follow the typical steps to [contribute code](https://guides.github.com/activities/contributing-to-open-source/#contributing):

1. Create your feature branch: `git checkout -b my-new-feature`
2. Make your changes and test them by running the extension in the browser as described above.
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request.

## Running in your regular Firefox (with your logins)

`pnpm dev:firefox` launches Firefox with a fresh, throwaway profile — none of your logins or cookies. To test against sites where you are signed in (e.g. paywalled PDFs), side-load the build into your own Firefox profile instead:

1. Run `pnpm dev:firefox` and leave it running (ignore the throwaway window it opens). It builds to `.output/firefox-mv3-dev/` and rebuilds on save.
2. In your normal Firefox, open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `.output/firefox-mv3-dev/manifest.json`.

This loads into your running Firefox with your real profile, and WXT's auto-reload refreshes it on save. Temporary add-ons are removed when Firefox restarts.

For a static build (no auto-reload), run `pnpm build:firefox` and load `.output/firefox-mv3/manifest.json` the same way, clicking **Reload** on the add-on card after each rebuild.

To keep it installed across restarts, build a package with `pnpm zip:firefox` (`.output/*-firefox.zip`) and install it in Firefox Developer Edition / Nightly / ESR after setting `xpinstall.signatures.required = false` in `about:config` (`about:addons` → gear → **Install Add-on From File…**). Release Firefox refuses unsigned add-ons.

### Talking to JabRef (fulltext bridge)

The extension side-loads on its own, but reaching JabRef's fulltext fetcher also needs the native-messaging host registered. It lives in JabRef's repo at [`browser-bridge/`](https://github.com/JabRef/jabref/tree/main/browser-bridge) and ships as a script (no build step). From a JabRef checkout, on Linux:

```sh
./browser-bridge/install/install.sh   # register the native-messaging manifest
```

The Firefox extension id (`@jabfox`) is pinned in `wxt.config.ts`, so the host's native-messaging manifest matches your side-loaded build too.

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

## Safari CI and Notarization

Safari CI currently has two jobs:

1. `.github/workflows/test.yml`
   - `safari-build`
   - runs on `macos-latest`
   - executes `pnpm safari:build-app`
2. `.github/workflows/release.yml`
   - `safari-package`
   - builds and uploads the unsigned Safari app artifact
   - `safari-publish`
   - publishes the Safari project to App Store Connect for actual releases

GitHub Actions secrets required for Safari publishing:

- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `SAFARI_APP_SIGNING_IDENTITY`
- `SAFARI_INSTALLER_SIGNING_IDENTITY`
- `APPLE_MACOS_PROVISIONING_PROFILE_BASE64`
- `APPLE_MACOS_EXTENSION_PROVISIONING_PROFILE_BASE64`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
