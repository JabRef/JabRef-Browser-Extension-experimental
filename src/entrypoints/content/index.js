function buildTranslators(translatorsInfo) {
  return (translatorsInfo || []).map((info) => {
    const path = info.path;
    if (!path) {
      throw new Error(`Translator ${info.label} is missing a path`);
    }
    const translator = new Zotero.Translator(info);
    // Zotero expects the path to be under `file`
    translator.file = {
      path: path,
    };
    return translator;
  });
}

// Returns the URL of the first PDF attachment across the translated items, or null.
function firstPdfAttachmentUrl(items) {
  for (const item of items || []) {
    for (const attachment of item.attachments || []) {
      const url = attachment && attachment.url;
      const isPdf =
        attachment && (attachment.mimeType === "application/pdf" || /\.pdf(\?|$)/i.test(url || ""));
      if (isPdf && url) {
        return url;
      }
    }
  }
  return null;
}

export default defineContentScript({
  // Set "registration" to runtime so this file isn't listed in manifest
  registration: "runtime",
  // Use an empty array for matches to prevent any host_permissions be added
  //  when using `registration: "runtime"`.
  matches: [],

  async main() {
    if (globalThis.__JABREF_CONTENT_SCRIPT_INITIALIZED__) {
      console.debug("[contentScript] already initialized");
      return;
    }
    globalThis.__JABREF_CONTENT_SCRIPT_INITIALIZED__ = true;
    console.debug("[contentScript] started");

    browser.runtime.onMessage.addListener(async (msg, _sender, _sendResponse) => {
      console.debug("[contentScript] received message: %o", msg);
      Zotero.isInject = true;
      Zotero.COHTTP = {
        request: async (method, url, options = {}) => {
          const response = await browser.runtime.sendMessage({
            type: "COHTTP.request",
            method,
            url,
            options,
          });
          // From upstream: https://github.com/zotero/zotero-connectors/blob/ea060a0aa2fea1267049b5fc880e53aa6c915eeb/src/common/messages.js#L319-L337
          response.getAllResponseHeaders = () => response.responseHeaders;
          response.getResponseHeader = function (name) {
            let match = response.responseHeaders.match(new RegExp(`^${name}: (.*)$`, "mi"));
            return match ? match[1] : null;
          };
          let isArrayBuffer =
            Array.isArray(response.response) && response.responseType === "arraybuffer";
          if (isArrayBuffer) {
            response.response = await unpackArrayBuffer(response.response);
          } else {
            response.responseText = response.response;
          }
          return response;
        },
      };
      Zotero.Translate.ItemSaver.prototype.saveItems = async function (
        jsonItems,
        _attachmentCallback,
        _itemsDoneCallback,
      ) {
        return jsonItems;
      };

      if (!msg) return;
      const { url } = msg;

      const translateEngine = await createTranslateEngine(url);

      if (msg.type === "detectTranslators") {
        const translatorsInfo = await translateEngine.detect();
        return {
          translatorsInfo,
        };
      }

      // Fulltext bridge: run the matched translator and return the first PDF
      // attachment URL directly (unlike runTranslators, which posts items to the
      // background via offscreenResult). saveItems is stubbed above, so this has
      // no save side effect.
      if (msg.type === "fulltextPdfUrl") {
        const translators = buildTranslators(msg.translatorsInfo);
        const result = await translateEngine.translate(document, translators);
        const pdfUrl = firstPdfAttachmentUrl(result.items);
        // Translators may emit a relative attachment URL (e.g. IEEE's
        // /stampPDF/getPDF.jsp). Resolve against the page so downloads.download,
        // which requires an absolute URL, can fetch it.
        return {
          pdfUrl: pdfUrl ? new URL(pdfUrl, document.baseURI).href : null,
          sourceUrl: url,
        };
      }

      if (msg.type !== "runTranslators") return;

      const translators = buildTranslators(msg.translatorsInfo);
      console.debug(
        "Content script received runTranslators message for url %o with translators %o",
        url,
        translators,
      );
      const result = await translateEngine.translate(document, translators);
      console.debug("Content script obtained translation result %o", result);
      console.debug(
        "Content script sending offscreenResult with %o item(s) for %o",
        result.items?.length ?? 0,
        url,
      );
      const response = await browser.runtime.sendMessage({
        type: "offscreenResult",
        url,
        items: result.items,
      });
      console.debug("Content script received background ack for offscreenResult %o", response);
    });
  },
});
