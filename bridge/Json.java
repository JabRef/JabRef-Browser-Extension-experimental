import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.StringJoiner;

import org.hisp.dhis.jsontree.JsonObject;
import org.hisp.dhis.jsontree.JsonValue;

/// Wire-format helpers for the JabRef Browser-Extension Fulltext Protocol.
///
/// Writers are hand-rolled with `StringJoiner` to keep the native-image
/// binary free of serialiser reflection. Readers use json-tree's lazy
/// projection so unknown fields are simply ignored, satisfying the
/// protocol's forward-compatibility rule.
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
        return new StringJoiner(",", "{", "}")
                .add("\"ok\":true")
                .add("\"name\":" + quote(name))
                .add("\"protocolVersion\":" + protocolVersion)
                .toString();
    }

    static String writeFulltextResponse(String id, String path, String sourceUrl) {
        StringJoiner j = new StringJoiner(",", "{", "}")
                .add("\"id\":" + quote(id))
                .add("\"path\":" + quote(path));
        if (sourceUrl != null && !sourceUrl.isBlank()) {
            j.add("\"sourceUrl\":" + quote(sourceUrl));
        }
        return j.toString();
    }

    static String writeError(String code, String message) {
        return new StringJoiner(",", "{", "}")
                .add("\"error\":" + quote(code))
                .add("\"message\":" + quote(message))
                .toString();
    }

    static String writeNmFetchRequest(String requestId, String doi, String url) {
        StringJoiner j = new StringJoiner(",", "{", "}")
                .add("\"type\":\"fetchFulltext\"")
                .add("\"requestId\":" + quote(requestId));
        if (doi != null && !doi.isBlank()) {
            j.add("\"doi\":" + quote(doi));
        }
        if (url != null && !url.isBlank()) {
            j.add("\"url\":" + quote(url));
        }
        return j.toString();
    }

    static String writeDiscovery(String name, String displayName, int port,
                                 String tokenFile, int protocolVersion) {
        return new StringJoiner(",", "{", "}")
                .add("\"name\":" + quote(name))
                .add("\"displayName\":" + quote(displayName))
                .add("\"port\":" + port)
                .add("\"tokenFile\":" + quote(tokenFile))
                .add("\"protocolVersion\":" + protocolVersion)
                .toString();
    }

    // ---- Readers (json-tree) ----

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

    // ---- Quoting ----

    /// RFC 8259 string escape. Control characters below 0x20 are emitted
    /// as six-character `backslash-u-HHHH` escapes so the result is safe
    /// to embed in any JSON context.
    static String quote(String s) {
        StringBuilder b = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\b' -> b.append("\\b");
                case '\f' -> b.append("\\f");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) {
                        b.append(String.format("\\u%04x", (int) c));
                    } else {
                        b.append(c);
                    }
                }
            }
        }
        return b.append('"').toString();
    }
}
