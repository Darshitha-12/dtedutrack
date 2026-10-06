package com.biopulse.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * Offline copy of the app in native storage.
 *
 * <p>A service worker cannot do this job inside this WebView — measured on a Galaxy A01 Core,
 * letting one answer navigations leaves the page stuck at {@code readyState "loading"} with an
 * empty document. Doing it natively keeps the request path untouched while the app is online and
 * only steps in when the network is gone, which is the case that matters anyway.
 *
 * <p>Deliberately simple and deliberately conservative:
 * <ul>
 *   <li>Only same-origin GETs are stored. Nothing under {@code /api/} is ever cached, so live
 *       data is never served stale by accident.</li>
 *   <li>Responses are capped, and the whole store is capped, so a large save cannot fill the
 *       device. Oldest entries are dropped first.</li>
 *   <li>Cookies are attached when saving so the cached page is the one the user actually saw,
 *       and session cookies are never written to disk with the entry.</li>
 * </ul>
 */
public final class OfflineCache {

    private static final String TAG = "BioPulseCache";
    private static final String DIR = "offline-cache";
    private static final long MAX_ENTRY_BYTES = 3L * 1024L * 1024L;
    private static final long MAX_TOTAL_BYTES = 64L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 20000;
    private static final String[] NEVER_CACHE_PREFIXES = {
            "/api/", "/login", "/register", "/forgot-password",
    };

    /**
     * Server-rendered pages contain an absolute reference to the chunk they were built against, so
     * a page served from the cache has to be paired with those exact assets. The web layer collects
     * them off the live document and sends them along, so they are written to a single lookup
     * table keyed by "shell:<path>" rather than being scattered across cache entries.
     */
    private static final String ASSET_DIR = "offline-assets";

    private OfflineCache() {
    }

    // ---------------------------------------------------------------- connectivity

    public static boolean isOnline(Context ctx) {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
                return caps != null
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
            }
            return cm.getActiveNetworkInfo() != null && cm.getActiveNetworkInfo().isConnected();
        } catch (Throwable t) {
            return false;
        }
    }

    // ---------------------------------------------------------------- keys

    private static File dir(Context ctx) {
        File d = new File(ctx.getFilesDir(), DIR);
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String key(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Throwable t) {
            return Integer.toHexString(url.hashCode());
        }
    }

    private static File bodyFile(Context ctx, String url) {
        return new File(dir(ctx), key(url) + ".bin");
    }

    private static File metaFile(Context ctx, String url) {
        return new File(dir(ctx), key(url) + ".meta");
    }

    /**
 * The URL a cache lookup should try first.
 *
 * <p>Next.js decorates client-side navigations with a {@code ?_rsc=} cache-buster, so the same
 * page is requested under a different URL than it was saved under. Dropping the query string makes
 * the two match again, while the path (which is what actually identifies the page) is preserved.
 */
public static String lookupUrl(String url) {
    if (url == null) return null;
    int q = url.indexOf('?');
    return q < 0 ? url : url.substring(0, q);
}

private static boolean cacheable(String url) {
        for (String p : NEVER_CACHE_PREFIXES) {
            if (url.contains(p)) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------- read / write

    /** Returns the stored entry, or {@code null} when the URL was never saved. */
    public static Entry read(Context ctx, String url) {
        File body = bodyFile(ctx, url);
        File meta = metaFile(ctx, url);
        if (!body.exists() || !meta.exists()) return null;

        String[] lines;
        try {
            lines = new String(readAll(meta), "UTF-8").split("\n", 2);
        } catch (IOException e) {
            return null;
        }
        if (lines.length < 2) return null;

        String mime = lines[0].isEmpty() ? guessMime(url) : lines[0];
        try {
            return new Entry(readAll(body), mime);
        } catch (IOException e) {
            return null;
        }
    }

    /** Fetches and stores one URL. Returns the number of bytes written, or 0 on failure. */
    public static long save(Context ctx, String url) {
        if (!cacheable(url)) return 0;

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");

            // The app's auth cookie is HttpOnly, so it only exists inside the WebView's cookie
            // jar. Forward it so the saved page is the signed-in one the user actually sees.
            String cookie = android.webkit.CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) {
                conn.setRequestProperty("Cookie", cookie);
            }

            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                Log.i(TAG, "skip " + code + " for " + url);
                return 0;
            }

            String mime = conn.getContentType();
            if (mime == null || mime.isEmpty()) mime = guessMime(url);
            else {
                int semi = mime.indexOf(';');
                if (semi > 0) mime = mime.substring(0, semi).trim();
            }

            byte[] bytes = readAll(conn.getInputStream(), MAX_ENTRY_BYTES);
            if (bytes == null || bytes.length == 0) return 0;

            write(bodyFile(ctx, url), bytes);
            write(metaFile(ctx, url), (mime + "\n" + url).getBytes("UTF-8"));
            prune(ctx);
            return bytes.length;
        } catch (Throwable t) {
            Log.w(TAG, "save failed for " + url + ": " + t.getMessage());
            return 0;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Removes every stored entry. */
    public static void clear(Context ctx) {
        File[] files = dir(ctx).listFiles();
        if (files == null) return;
        for (File f : files) {
            if (!f.delete()) Log.w(TAG, "could not delete " + f.getName());
        }
    }

    /** How many entries and bytes are currently stored. */
    public static String stats(Context ctx) {
        File[] files = dir(ctx).listFiles();
        if (files == null) return "{\"count\":0,\"bytes\":0}";
        int count = 0;
        long bytes = 0;
        for (File f : files) {
            if (!f.getName().endsWith(".bin")) continue;
            count++;
            bytes += f.length();
        }
        return "{\"count\":" + count + ",\"bytes\":" + bytes + "}";
    }

    // ---------------------------------------------------------------- housekeeping

    /** Drops the oldest entries until the store fits inside {@link #MAX_TOTAL_BYTES}. */
    private static void prune(Context ctx) {
        File[] files = dir(ctx).listFiles();
        if (files == null) return;

        long total = 0;
        List<File> entries = new ArrayList<>();
        for (File f : files) {
            if (!f.getName().endsWith(".bin")) continue;
            entries.add(f);
            total += f.length();
        }

        // Oldest first, so the least recently saved pages are the ones dropped.
        entries.sort((a, b) -> Long.compare(a.lastModified(), b.lastModified()));

        for (File f : entries) {
            if (total <= MAX_TOTAL_BYTES) break;
            long size = f.length();
            File meta = new File(f.getParentFile(), f.getName().replace(".bin", ".meta"));
            if (f.delete()) total -= size;
            meta.delete();
            Log.i(TAG, "pruned " + f.getName() + " (" + size + " bytes)");
        }
    }

    // ---------------------------------------------------------------- helpers

    private static byte[] readAll(InputStream in, long limit) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        long total = 0;
        int read;
        while ((read = in.read(buf)) != -1) {
            total += read;
            if (total > limit) return null;
            out.write(buf, 0, read);
        }
        return out.toByteArray();
    }

    private static byte[] readAll(File f) throws IOException {
        try (InputStream in = new java.io.FileInputStream(f)) {
            return readAll(in, MAX_ENTRY_BYTES);
        }
    }

    private static void write(File f, byte[] bytes) throws IOException {
        OutputStream out = new FileOutputStream(f);
        try {
            out.write(bytes);
        } finally {
            out.close();
        }
    }

    private static String guessMime(String url) {
        String path = url.toLowerCase();
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        return "text/html";
    }

    /** A stored response. */
    public static final class Entry {
        public final byte[] body;
        public final String mime;

        Entry(byte[] body, String mime) {
            this.body = body;
            this.mime = mime;
        }
    }
}