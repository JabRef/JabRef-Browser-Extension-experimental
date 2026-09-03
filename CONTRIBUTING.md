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
