## Contributing to the Development

JabRef browser extension uses the [WebExtensions API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

Preparation:

1. Install [Node.js](https://nodejs.org) (e.g., `choco install nodejs`) and [pnpm](https://pnpm.io) (e.g., `npm install -g pnpm`).
2. [Fork the repository](https://help.github.com/articles/fork-a-repo/).
3. Checkout the repository.
4. Install development dependencies via `pnpm install`.
5. Start browser with the add-on activated:
   Firefox: `pnpm dev:firefox`
   Chrome: `pnpm dev:chrome`
   Opera: `pnpm dev:opera`
   Edge: `pnpm dev:edge`

Now just follow the typical steps to [contribute code](https://guides.github.com/activities/contributing-to-open-source/#contributing):

1. Create your feature branch: `git checkout -b my-new-feature`
2. Make your changes and test them by running the extension in the browser as described above.
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request.

## Running in your regular Firefox (with your logins)

`pnpm dev:firefox` starts Firefox with a fresh, throwaway profile — none of your logins or cookies. To test against sites where you are signed in (e.g. paywalled PDFs), side-load a build into your normal Firefox profile instead:

1. Build the Firefox target: `pnpm build:firefox` (output: `.output/firefox-mv3/`).
2. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `.output/firefox-mv3/manifest.json`.

This loads into your running Firefox with your real profile. After each rebuild, click **Reload** on the add-on card. Temporary add-ons are removed when Firefox restarts.

To keep it installed across restarts, build a package with `pnpm zip:firefox` (`.output/*-firefox.zip`) and install it in Firefox Developer Edition / Nightly / ESR after setting `xpinstall.signatures.required = false` in `about:config` (`about:addons` → gear → **Install Add-on From File…**). Release Firefox refuses unsigned add-ons.

### Talking to JabRef (fulltext bridge)

The extension side-loads on its own, but reaching JabRef's fulltext fetcher also needs the native-messaging bridge built and installed. See [`bridge/README.md`](bridge/README.md); on Linux:

```sh
(cd bridge && ./build.sh)         # native bridge binary
./bridge/install/install.sh       # register the native-messaging manifest
```

The Firefox extension id (`@jabfox`) is pinned in `wxt.config.ts`, so the bridge's native-messaging manifest matches your side-loaded build too.

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
