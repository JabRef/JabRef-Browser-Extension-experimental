import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

import org.hisp.dhis.jsontree.JsonObject;
import org.hisp.dhis.jsontree.JsonValue;

import static org.hisp.dhis.jsontree.Json.object;

/// Wire-format helpers for the JabRef Browser-Extension Fulltext Protocol.
///
/// Writers build the JSON via json-tree's typed builder so escaping and
/// number formatting stay consistent with the readers. Readers use
/// json-tree's lazy projection so unknown fields are simply ignored,
/// satisfying the protocol's forward-compatibility rule.
final class Json {

    private Json() {
    }

    // ---- Wire records ----

    /// `POST /v1/fulltext` request body.
    record FulltextRequest(String doi, String url) {
    }

    /// Native-messaging reply from the extension. Either `error` is non-null
    /// (failure flow) or `path` is non-null (success flow).
    record NmReply(String requestId, String id, String path, String sourceUrl,
                   String error, String message) {
    }

    // ---- Writers ----

    static String writeHealth(String name, int protocolVersion) {
        return object(o -> o
                .addBoolean("ok", true)
                .addString("name", name)
                .addNumber("protocolVersion", protocolVersion))
                .toJson();
    }

    static String writeFulltextResponse(String id, String path, String sourceUrl) {
        return object(o -> {
            o.addString("id", id).addString("path", path);
            if (sourceUrl != null && !sourceUrl.isBlank()) {
                o.addString("sourceUrl", sourceUrl);
            }
        }).toJson();
    }

    static String writeError(String code, String message) {
        return object(o -> o.addString("error", code).addString("message", message)).toJson();
    }

    static String writeNmFetchRequest(String requestId, String doi, String url) {
        return object(o -> {
            o.addString("type", "fetchFulltext").addString("requestId", requestId);
            if (doi != null && !doi.isBlank()) {
                o.addString("doi", doi);
            }
            if (url != null && !url.isBlank()) {
                o.addString("url", url);
            }
        }).toJson();
    }

    static String writeDiscovery(String name, String displayName, int port,
                                 String tokenFile, int protocolVersion) {
        return object(o -> o
                .addString("name", name)
                .addString("displayName", displayName)
                .addNumber("port", port)
                .addString("tokenFile", tokenFile)
                .addNumber("protocolVersion", protocolVersion))
                .toJson();
    }

    // ---- Readers ----

    static FulltextRequest readFulltextRequest(InputStream in) {
        JsonObject obj = readObject(in);
        return new FulltextRequest(
                optString(obj, "doi"),
                optString(obj, "url"));
    }

    static NmReply readNmReply(byte[] body) {
        JsonObject obj = JsonValue.of(new String(body, StandardCharsets.UTF_8)).asObject();
        return new NmReply(
                optString(obj, "requestId"),
                optString(obj, "id"),
                optString(obj, "path"),
                optString(obj, "sourceUrl"),
                optString(obj, "error"),
                optString(obj, "message"));
    }

    private static JsonObject readObject(InputStream in) {
        try {
            return JsonValue.of(new String(in.readAllBytes(), StandardCharsets.UTF_8)).asObject();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String optString(JsonObject obj, String name) {
        return obj.getString(name).string(null);
    }
}
