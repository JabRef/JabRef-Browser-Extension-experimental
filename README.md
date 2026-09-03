# JabRef Browser Extension

> [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabref/?src=external-github) - [Chrome](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - [Edge](https://microsoftedge.microsoft.com/addons/detail/pgkajmkfgbehiomipedjhoddkejohfna) - [Vivaldi](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - Safari (build from source)

Browser extension for users of the bibliographic reference manager [JabRef](https://www.jabref.org/).
It automatically identifies and extracts bibliographic information on websites and sends them to JabRef with one click.

When you find an interesting article through Google Scholar, the arXiv or journal websites, this browser extension allows you to add those references to JabRef.
Even links to accompanying PDFs are sent to JabRef, where those documents can easily be downloaded, renamed and placed in the correct folder.
[A wide range of publisher sites, library catalogs and databases are supported](https://www.zotero.org/support/translators).

_Please post any issues or suggestions [here on GitHub](https://github.com/JabRef/JabRef-Browser-Extension/issues)._

## Installation and Configuration

Normally, you simply install the extension from the browser store and are ready to go.

> [Firefox](https://addons.mozilla.org/en-US/firefox/addon/jabref/?src=external-github) - [Chrome](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - [Edge](https://microsoftedge.microsoft.com/addons/detail/pgkajmkfgbehiomipedjhoddkejohfna) - [Vivaldi](https://chrome.google.com/webstore/detail/jabref-browser-extension/bifehkofibaamoeaopjglfkddgkijdlh) - Safari (build from source)

Sometimes, a manual installation is necessary (e.g. if you use the portable version of JabRef). In this case, please follow the steps described [in the user manual](https://docs.jabref.org/import-export/import/jabref-browser-extension).

### Troubleshooting native messaging on macOS Chrome

If Chrome reports `Specified native messaging host not found.`, its registered JabRef host manifest may refer to an old location for `jabrefHost.py`. Reinstall the manifest bundled with the currently installed JabRef application:

```sh
sudo cp "/Applications/JabRef.app/Contents/Resources/native-messaging-host/chromium/org.jabref.jabref.json" \
  "/Library/Google/Chrome/NativeMessagingHosts/org.jabref.jabref.json"
```

Quit Chrome completely and reopen it afterwards. This assumes JabRef is installed in `/Applications`; adjust the first path if it is installed elsewhere.

### Troubleshooting: extension missing under "External Fetchers"

JabRef lists the extension under **Preferences → Web search → External Fetchers** only while the fulltext bridge host is running.
If the list stays empty (or shows other providers but not `jabext-bridge`), the browser could not start the host.
Typical tell-tales:

- `about:debugging` (Firefox) shows **Background script: Stopped** for the JabRef Browser Extension.
- The extension's console (**Inspect** in `about:debugging` or `chrome://extensions`) logs `[native-bridge] connectNative failed` or `No such native application jabext_bridge`.
- `%APPDATA%\JabRef\fulltext-providers` (Windows), `~/.config/JabRef/fulltext-providers` (Linux) or `~/Library/Application Support/JabRef/fulltext-providers` (macOS) contains no `jabext-bridge.*.json`.

The usual cause is a stale `jabext_bridge` native-messaging manifest: it stores an absolute path to the host script, so the entry breaks silently once that checkout or installation moves.
Re-register the host, then click **Reload** on the extension:

- Released JabRef: reinstall JabRef; its installer registers the manifest.
- Source checkout: run the bridge installer from the JabRef repository (`pwsh browser-bridge/install/install.ps1` on Windows, `./browser-bridge/install/install.sh` on Linux, `sh browser-bridge/install/install.command` on macOS).

Reopen the JabRef preferences afterwards; the provider list is read when the dialog opens.

## Usage

After the installation, you should be able to import bibliographic references into JabRef directly from your browser.
Just visit a publisher site or some other website containing bibliographic information (for example, [the arXiv](http://arxiv.org/list/gr-qc/pastweek?skip=0&show=5)) and click the JabRef symbol in the Firefox search bar (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>).
Once the JabRef browser extension has extracted the references and downloaded the associated PDF's, the import window of JabRef opens.

You might want to configure JabRef so that new entries are always imported in an already opened instance of JabRef.
For this, activate "Remote operation" under the Network tab in the JabRef Preferences.

## Architecture

How JabRef and this extension interact is specified in JabRef's requirements docs:

- [Browser-Extension Fulltext Protocol](https://github.com/JabRef/jabref/blob/main/docs/requirements/browser-extension-fulltext.md) (`req~bxf.*`) — JabRef fetches full-text PDFs through the browser. The provider half lives in JabRef's [`browser-bridge/`](https://github.com/JabRef/jabref/tree/main/browser-bridge), a small native-messaging companion process.
- [MathSciNet sync](https://github.com/JabRef/jabref/blob/main/docs/requirements/mathscinet.md) (`req~mathscinet.sync.*`) — JabRef opens or focuses a MathSciNet browser tab for the current entry, via the same bridge.

## About this Add-On

Internally, this browser extension uses the magic of Zotero's site translators.
Thus most of the credit has to go to the Zotero development team and to the many authors of the [site translators collection](https://github.com/zotero/translators).
Note that this browser extension does not make any changes to the Zotero database and thus both plug-ins coexist happily with each other.
