package com.biopulse.app.telegram;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.DownloadManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import com.biopulse.app.R;
import com.biopulse.app.MediaPlaybackService;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Hosts Telegram Web (web.telegram.org/a) inside the app and makes it behave like a real app:
 * full-screen, file upload through the system picker, and downloads (media, PDFs, files) that are
 * saved to storage and can be opened straight from the notification / viewer.
 */
public class TelegramWebActivity extends Activity {

    private static final String TAG = "BioPulseTgWeb";
    private static final String START_URL = "https://web.telegram.org/a/";
    private static final int REQ_FILE = 1001;

    private WebView web;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler main = new Handler(Looper.getMainLooper());
    private int notifSeq = 0;
    private long pendingOpenDownloadId = -1L;
    private BroadcastReceiver downloadReceiver;
    private static volatile boolean foreground = false;
    private long pendingChatId = 0L;

    /** The live instance, so the media notification's transport buttons can reach this WebView. */
    private static volatile TelegramWebActivity current;

    /**
     * Routes a media-notification action (play/pause/stop) into the Telegram WebView's injected
     * audio hook. Called from {@link MediaPlaybackService} on the main thread.
     */
    public static void dispatchMediaCommand(String command) {
        TelegramWebActivity act = current;
        if (act == null) return;
        act.runOnUiThread(() -> act.sendTgMediaCommand(command));
    }

    private void sendTgMediaCommand(String command) {
        try {
            if (web == null) return;
            String js = "(function(){try{if(typeof window.__bp_tg_media==='function')"
                    + "{window.__bp_tg_media(" + JSONObject.quote(command == null ? "" : command) + ");"
                    + "return 'ok';}return 'none';}catch(e){return 'err';}})()";
            web.evaluateJavascript(js, null);
        } catch (Throwable ignored) {
        }
    }

    /**
     * In-flight streamed downloads. Telegram Web hands files to the page as in-memory {@code Blob}s
     * (often built inside a worker), which the WebView never exposes through
     * {@link DownloadListener}. The injected hook forwards those blobs here one chunk at a time so a
     * large video is written straight to disk instead of being base64'd all at once (which OOMs a
     * low-end device and leaves the UI stuck on "processing").
     */
    private final Map<String, FileOutputStream> dlStreams = new ConcurrentHashMap<>();
    private final Map<String, File> dlFiles = new ConcurrentHashMap<>();
    private final Map<String, String[]> dlMeta = new ConcurrentHashMap<>();
    private int dlNotifSeq = 0;

    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private Dialog popupDialog;

    /** True while the Telegram Web UI is the visible screen (native side then skips notifying). */
    public static boolean isForeground() {
        return foreground;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        setContentView(R.layout.activity_telegram_web);

        web = findViewById(R.id.tgWebView);
        progress = findViewById(R.id.tgWebProgress);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            s.setOffscreenPreRaster(false);
        }
        s.setBlockNetworkImage(false);
        s.setLoadsImagesAutomatically(true);
        web.setLayerType(View.LAYER_TYPE_NONE, null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new WebBridge(), "BioPulseWeb");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener(new Downloads());

        TelegramNotifications.ensureChannel(this);
        requestNotifPermission();

        // Keep the WebView renderer + process alive while Telegram is connected. A foreground
        // service holds the renderer open, so chats stay warm (messages open instantly) and media
        // Telegram has already fetched is not downloaded again after the app is closed and reopened.
        getSharedPreferences("bp_prefs", MODE_PRIVATE).edit().putBoolean("tg_keepalive", true).apply();
        MediaPlaybackService.setMediaOwner("telegram");
        MediaPlaybackService.startKeepAlive(this);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
            long chatId = getIntent().getLongExtra("chatId", 0L);
            if (chatId != 0L) openChat(chatId);
        } else {
            pendingChatId = getIntent().getLongExtra("chatId", 0L);
            web.loadUrl(pendingChatId != 0L ? deepLink(pendingChatId) : START_URL);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent == null) return;
        long chatId = intent.getLongExtra("chatId", 0L);
        if (chatId != 0L) {
            pendingChatId = chatId;
            if (web != null) openChat(chatId);
        }
    }

    /** Telegram Web A peer URL, e.g. {@code https://web.telegram.org/a/#-1001234567890}. */
    private static String deepLink(long chatId) {
        return START_URL + "#" + chatId;
    }

    private void openChat(long chatId) {
        if (web == null) return;
        try {
            web.evaluateJavascript(
                    "try{location.hash='#" + chatId + "'}catch(e){}", null);
        } catch (Throwable ignored) {
        }
    }

    private void requestNotifPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 77);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
    }

    @Override
    protected void onPause() {
        foreground = false;
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        try {
            if (downloadReceiver != null) unregisterReceiver(downloadReceiver);
        } catch (Throwable ignored) {
        }
        downloadReceiver = null;
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) {
            hideFullscreen();
            return;
        }
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void hideFullscreen() {
        if (fullscreenView == null) return;
        ViewGroup root = findViewById(android.R.id.content);
        root.removeView(fullscreenView);
        fullscreenView = null;
        if (fullscreenCallback != null) {
            fullscreenCallback.onCustomViewHidden();
            fullscreenCallback = null;
        }
    }

    // ------------------------------------------------------------- web client

    private class Client extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            injectNotificationShim();
            injectDownloadHook();
            injectVideoHook();
            injectMediaHook();
            injectReadDateHook();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            injectNotificationShim();
            injectDownloadHook();
            injectVideoHook();
            injectMediaHook();
            injectReadDateHook();
            main.postDelayed(TelegramWebActivity.this::injectDownloadHook, 1200);
            main.postDelayed(TelegramWebActivity.this::injectNotificationShim, 1500);
            main.postDelayed(TelegramWebActivity.this::injectReadDateHook, 1800);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handle(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handle(Uri.parse(url));
        }

        private boolean handle(Uri uri) {
            if (uri == null) return false;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            if (scheme.equals("http") || scheme.equals("https")) {
                if (host.endsWith("telegram.org") || host.endsWith("t.me")
                        || host.endsWith("telegramlabs.com")) {
                    return false; // keep inside the web client
                }
                openExternal(uri);
                return true;
            }
            if (scheme.equals("tg") || scheme.equals("mailto") || scheme.equals("tel")
                    || scheme.equals("sms")) {
                openExternal(uri);
                return true;
            }
            return false;
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden();
                return;
            }
            fullscreenView = view;
            fullscreenCallback = callback;
            ViewGroup root = findViewById(android.R.id.content);
            view.setBackgroundColor(0xFF000000);
            root.addView(view, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }

        @Override
        public void onHideCustomView() {
            hideFullscreen();
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture,
                                      Message resultMsg) {
            final WebView popup = new WebView(TelegramWebActivity.this);
            WebSettings ps = popup.getSettings();
            ps.setJavaScriptEnabled(true);
            ps.setDomStorageEnabled(true);
            ps.setDatabaseEnabled(true);
            ps.setAllowFileAccess(true);
            ps.setAllowContentAccess(true);
            ps.setMediaPlaybackRequiresUserGesture(false);
            ps.setSupportMultipleWindows(true);
            ps.setJavaScriptCanOpenWindowsAutomatically(true);
            ps.setCacheMode(WebSettings.LOAD_DEFAULT);
            popup.setBackgroundColor(0xFF000000);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                popup.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }
            popup.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                    return popupShouldOverride(req.getUrl());
                }

                @Override
                @SuppressWarnings("deprecation")
                public boolean shouldOverrideUrlLoading(WebView v, String url) {
                    return popupShouldOverride(Uri.parse(url));
                }
            });
            final Dialog dialog = new Dialog(TelegramWebActivity.this,
                    android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            FrameLayout container = new FrameLayout(TelegramWebActivity.this);
            container.addView(popup, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            dialog.setContentView(container);
            dialog.setOnDismissListener(d -> {
                try {
                    popup.destroy();
                } catch (Throwable ignored) {
                }
                if (popupDialog == dialog) popupDialog = null;
            });
            popupDialog = dialog;
            dialog.show();
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            if (popupDialog != null) {
                popupDialog.dismiss();
                popupDialog = null;
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
            }
            fileCallback = callback;
            try {
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(Intent.createChooser(intent, "Choose file"), REQ_FILE);
                return true;
            } catch (Throwable t) {
                fileCallback = null;
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) {
                        result[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ------------------------------------------------------------- downloads

    private class Downloads implements DownloadListener {
        @Override
        public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                    String mimeType, long contentLength) {
            String name = guessName(url, contentDisposition, mimeType);
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                fetchBlobAndSave(url, mimeType, name);
            } else {
                enqueueManager(url, userAgent, name, mimeType);
            }
        }
    }

    private void enqueueManager(String url, String userAgent, String name, String mime) {
        try {
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
            try {
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) req.addRequestHeader("Cookie", cookie);
            } catch (Throwable ignored) {
            }
            if (mime != null && !mime.isEmpty()) req.setMimeType(mime);
            req.setTitle(name);
            req.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                long id = dm.enqueue(req);
                if (isPdf(name, mime)) {
                    pendingOpenDownloadId = id;
                    registerDownloadReceiver();
                }
            }
            toast("Downloading " + name + "…");
        } catch (Throwable t) {
            Log.w(TAG, "download failed", t);
            toast("Couldn't download file");
        }
    }

    private static boolean isPdf(String name, String mime) {
        if (mime != null && mime.toLowerCase().contains("pdf")) return true;
        return name != null && name.toLowerCase().endsWith(".pdf");
    }

    /** When a PDF finishes downloading, hand it to the phone's PDF viewer instead of the WebView. */
    private void registerDownloadReceiver() {
        if (downloadReceiver != null) return;
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (id != pendingOpenDownloadId) return;
                pendingOpenDownloadId = -1L;
                try {
                    unregisterReceiver(this);
                } catch (Throwable ignored) {
                }
                downloadReceiver = null;
                try {
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm == null) return;
                    Uri uri = dm.getUriForDownloadedFile(id);
                    if (uri == null) return;
                    String mime = dm.getMimeTypeForDownloadedFile(id);
                    Intent v = new Intent(Intent.ACTION_VIEW);
                    v.setDataAndType(uri, (mime == null || mime.isEmpty())
                            ? "application/pdf" : mime);
                    v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(Intent.createChooser(v, "Open with"));
                } catch (Throwable t) {
                    Log.w(TAG, "open download failed", t);
                }
            }
        };
        IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadReceiver, f, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(downloadReceiver, f);
        }
    }

    /**
     * Telegram Web raises browser notifications for messages that arrive while the page is hidden.
     * A WebView exposes no {@code Notification} API, so install a shim that forwards those calls to
     * the native side ({@link WebBridge#notify}). Idempotent and safe to run repeatedly.
     */
    private void injectNotificationShim() {
        // When the native TDLib engine is signed in it already delivers always-on notifications
        // (even with the app closed), so the in-page shim is only a fallback for web-only logins.
        if (TelegramNative.isReady()) return;
        final String js = "(function(){try{"
                + "if(window.__bpNotifHooked)return;window.__bpNotifHooked=true;"
                + "function BP(title,opts){try{opts=opts||{};"
                + "var body=opts.body||'';var tag=opts.tag||opts.renotifyTag||'';"
                + "if(window.BioPulseWeb&&window.BioPulseWeb.notify){"
                + "window.BioPulseWeb.notify(String(title||'Telegram'),String(body),String(tag));}"
                + "}catch(e){}"
                + "this.close=function(){};this.onclick=null;this.onerror=null;this.onshow=null;"
                + "this.addEventListener=function(){};this.removeEventListener=function(){};"
                + "this.dispatchEvent=function(){return true;};}"
                + "BP.permission='granted';BP.maxActions=0;"
                + "BP.requestPermission=function(cb){try{if(typeof cb==='function')cb('granted');}"
                + "catch(e){}return Promise.resolve('granted');};"
                + "window.Notification=BP;"
                + "}catch(e){}})();";
        runOnUiThread(() -> {
            try {
                web.evaluateJavascript(js, null);
            } catch (Throwable ignored) {
            }
        });
    }

    /**
     * Telegram Web builds downloaded files as in-memory {@code Blob}s and hands them to the browser
     * via {@code URL.createObjectURL()} + a synthetic anchor click. A WebView never surfaces those
     * as a {@link DownloadListener} event, which is why PDFs/videos "failed to download". This hook
     * keeps the most recent blobs it sees (bounded to a small LRU so streamed video/audio blobs do
     * not accumulate and exhaust the heap on low-RAM devices), then pushes the bytes to the native
     * bridge when Telegram tries to save one, so the file is written to disk and opened with the
     * phone's own app.
     */
    private void injectDownloadHook() {
        final String js = "(function(){try{"
                + "if(window.__bpDhHooked)return;window.__bpDhHooked=true;"
                + "var blobs={};var bkeys=[];var BMAX=6;"
                + "function keepb(u){try{bkeys.push(u);while(bkeys.length>BMAX){"
                + "var k=bkeys.shift();if(k!==u){delete blobs[k];}}}catch(e){}}"
                + "function toB64(bytes){var bin='';var c=0x8000;"
                + "for(var i=0;i<bytes.length;i+=c){bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+c));}"
                + "return btoa(bin);}"
                + "function whole(b,name){try{var fr=new FileReader();fr.onload=function(){try{"
                + "var r=fr.result||'';var i=r.indexOf(',');var d=i>=0?r.substring(i+1):'';"
                + "var mime=(b&&b.type)?b.type:'';"
                + "if(window.BioPulseWeb&&window.BioPulseWeb.saveBase64){"
                + "window.BioPulseWeb.saveBase64(d,mime,String(name||('telegram_'+Date.now())));}"
                + "}catch(e){}};fr.readAsDataURL(b);}catch(e){}}"
                + "function streamBlob(b,name){try{"
                + "if(!b){return;}"
                + "var mime=(b.type)?b.type:'';"
                + "if(!b.stream){whole(b,name);return;}"
                + "var id='dl'+Date.now()+'x'+Math.floor(Math.random()*1e6);"
                + "var started=false;var rd=b.stream().getReader();"
                + "function pump(){rd.read().then(function(res){"
                + "if(res.done){try{BioPulseWeb.finishDownload(id);}catch(e){}return;}"
                + "try{if(!started){started=true;"
                + "BioPulseWeb.beginDownload(id,String(name||'telegram_file'),String(mime));}"
                + "BioPulseWeb.appendDownload(id,toB64(res.value));}catch(e){}"
                + "pump();"
                + "}).catch(function(e){try{BioPulseWeb.finishDownload(id);}catch(_){}});}"
                + "pump();"
                + "}catch(e){}}"
                + "function grab(u,name){try{"
                + "if(blobs[u]){var b=blobs[u];blobs[u]=null;streamBlob(b,name);return;}"
                + "fetch(u).then(function(r){return r.blob();}).then(function(bl){streamBlob(bl,name);})"
                + ".catch(function(){});"
                + "}catch(e){}}"
                + "try{var co=URL.createObjectURL;URL.createObjectURL=function(o){"
                + "var u=co.call(URL,o);try{blobs[u]=o;keepb(u);}catch(e){}return u;};}catch(e){}"
                + "try{if(window.webkitURL&&window.webkitURL.createObjectURL){"
                + "var co2=window.webkitURL.createObjectURL;"
                + "window.webkitURL.createObjectURL=function(o){"
                + "var u=co2.call(window.webkitURL,o);try{blobs[u]=o;keepb(u);}catch(e){}return u;};}}catch(e){}"
                + "try{var ck=HTMLAnchorElement.prototype.click;"
                + "HTMLAnchorElement.prototype.click=function(){try{"
                + "var h=this.href||'';"
                + "if(h.indexOf('blob:')!==0&&h.indexOf('data:')!==0){return ck.apply(this,arguments);}"
                + "var dn=this.getAttribute('download')||this.download||'';"
                + "var hasDl=this.hasAttribute&&this.hasAttribute('download');"
                + "var bb=blobs[h];var mime=(bb&&bb.type)?bb.type:'';"
                + "var media=mime.indexOf('video/')===0||mime.indexOf('audio/')===0||mime.indexOf('image/')===0;"
                + "if(hasDl||(!media&&!this.isConnected)){grab(h,dn);return;}"
                + "}catch(e){}return ck.apply(this,arguments);};}catch(e){}"
                + "}catch(e){}})();";
        runOnUiThread(() -> {
            try {
                web.evaluateJavascript(js, null);
            } catch (Throwable ignored) {
            }
        });
    }

    /**
     * Telegram Web A plays video through its own in-page player which has to fetch the whole clip up
     * front (no native streaming), so tapping a video stalls on a black screen for a long time. This
     * hook intercepts taps on video message bubbles and hands the chat/message ids to the native
     * TDLib + ExoPlayer path, which streams immediately. If the native side can't resolve the message
     * it calls {@code window.__bpNativeFailed()} which re-plays the tap so Telegram Web's own viewer
     * still opens as a fallback.
     */
    private void injectMediaHook() {
        final String js = "(function(){try{"
                + "if(window.__bpMediaHooked)return;"
                + "var B=window.BioPulseWeb;if(!B||typeof B.tgMediaState!=='function')return;"
                + "window.__bpMediaHooked=true;"
                + "var lastHad=false;"
                + "function metaTitle(){try{var ms=navigator.mediaSession;if(ms&&ms.metadata){var m=ms.metadata;return (m.title||'')+(m.artist?(' - '+m.artist):'');}}catch(e){}return '';}"
                + "function pick(){var els=document.querySelectorAll('audio,video');var i,el;for(i=0;i<els.length;i++){el=els[i];if(!el.paused&&!el.ended)return el;}for(i=0;i<els.length;i++){el=els[i];if(el.currentTime>0&&!el.ended&&el.duration)return el;}return null;}"
                + "function report(){try{var el=pick();if(!el){if(lastHad){lastHad=false;B.tgMediaState('',0,0,false,false,false);}return;}lastHad=true;var t=metaTitle()||document.title||'Telegram';var vid=(el.tagName==='VIDEO');B.tgMediaState(String(t),Number(el.currentTime)||0,Number(el.duration)||0,!el.paused,true,vid);}catch(e){}}"
                + "function bind(el){if(!el||el.__bpMediaBound)return;el.__bpMediaBound=true;var evs=['play','playing','pause','ended','timeupdate','durationchange','loadedmetadata','seeking'];for(var i=0;i<evs.length;i++){el.addEventListener(evs[i],report,true);}}"
                + "function scan(){var els=document.querySelectorAll('audio,video');for(var i=0;i<els.length;i++){bind(els[i]);}}"
                + "window.__bp_tg_media=function(cmd){try{var el=pick();if(!el)return;if(cmd==='play'){try{el.play();}catch(e){}}else if(cmd==='pause'){try{el.pause();}catch(e){}}else if(cmd==='stop'){try{el.pause();el.currentTime=0;}catch(e){}}setTimeout(report,120);}catch(e){}};"
                + "scan();"
                + "try{var mo=new MutationObserver(function(){scan();});mo.observe(document.documentElement||document.body,{childList:true,subtree:true});}catch(e){}"
                + "setInterval(function(){scan();report();},1000);"
                + "}catch(e){}})();";
        runOnUiThread(() -> {
            try {
                web.evaluateJavascript(js, null);
            } catch (Throwable ignored) {
            }
        });
    }

    /**
     * Tapping one of your own messages in Telegram Web shows nothing about when the other user read
     * it (Web has no read-time UI). This hook forwards the chat id + message id to the native TDLib
     * session, which answers with the exact read time; the result is shown in a native dialog.
     */
    private void injectReadDateHook() {
        final String js = "(function(){try{"
                + "if(window.__bpReadHooked)return;window.__bpReadHooked=true;"
                + "function chatFromHash(){try{var h=window.location.hash||'';h=h.replace(/^#/,'');"
                + "var m=h.split('/')[0].split('?')[0];if(/^-?[0-9]+$/.test(m))return m;}catch(e2){}return '';}"
                + "function handler(e){try{"
                + "var W=window.BioPulseWeb;if(!W||typeof W.showReadDate!=='function')return;"
                + "var t=e.target;var b=(t&&t.closest)?t.closest('[data-message-id]'):null;if(!b)return;"
                + "var cl=b.classList;var own=cl&&(cl.contains('own')||cl.contains('is-out'));"
                + "if(!own)return;"
                + "var mid=b.getAttribute('data-message-id');var cid=chatFromHash();"
                + "if(!cid||!mid)return;"
                + "W.showReadDate(String(cid),String(mid));"
                + "}catch(e2){}}"
                + "document.addEventListener('click',handler,true);"
                + "}catch(e){}})();";
        runOnUiThread(() -> {
            try {
                web.evaluateJavascript(js, null);
            } catch (Throwable ignored) {
            }
        });
    }

    private void injectVideoHook() {
        final String js = "(function(){try{"
                + "if(window.__bpVidHooked)return;window.__bpVidHooked=true;"
                + "window.__bpBypass=false;window.__bpLastVideoEl=null;"
                + "window.__bpNativeFailed=function(){try{"
                + "var el=window.__bpLastVideoEl;window.__bpLastVideoEl=null;if(!el)return;"
                + "try{var W0=window.BioPulseWeb;if(W0&&W0.toastMsg)W0.toastMsg('Fast video unavailable, using web player');}catch(e2){}"
                + "window.__bpBypass=true;"
                + "try{el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));}catch(e2){}"
                + "window.__bpBypass=false;}catch(e2){}};"
                + "function chatFromHash(){try{var h=window.location.hash||'';h=h.replace(/^#/,'');"
                + "var m=h.split('/')[0].split('?')[0];if(/^-?[0-9]+$/.test(m))return m;}catch(e2){}return '';}"
                + "function mediaOf(t){try{return t&&t.closest?t.closest('.media-inner'):null;}catch(e2){return null;}}"
                + "function isVideoLike(m){try{"
                + "if(!m)return false;"
                + "if(m.classList&&m.classList.contains('RoundVideo'))return false;"
                + "var badge=m.querySelector('.message-media-duration');"
                + "var vid=m.querySelector('video');"
                + "if(badge){var txt=(badge.textContent||'').replace(/\\s/g,'').toUpperCase();"
                + "if(txt==='GIF')return false;return true;}"
                + "return !!vid;"
                + "}catch(e2){return false;}}"
                + "function handler(e){try{"
                + "if(window.__bpBypass)return;"
                + "var W=window.BioPulseWeb;if(!W)return;"
                + "var m=mediaOf(e.target);if(!m)return;"
                + "if(!isVideoLike(m))return;"
                + "var b=m.closest('[data-message-id]');"
                + "if(!b&&e.target&&e.target.closest)b=e.target.closest('[data-message-id]');"
                + "if(!b)return;"
                + "var cid=chatFromHash();var mid=b.getAttribute('data-message-id');"
                + "if(!cid||!mid)return;"
                + "if(!(W.canPlayNative&&W.canPlayNative()&&W.playNative))return;"
                + "var ok=false;try{ok=W.playNative(String(cid),String(mid));}catch(x){ok=false;}"
                + "if(ok){window.__bpLastVideoEl=m;"
                + "if(e.preventDefault)e.preventDefault();"
                + "if(e.stopPropagation)e.stopPropagation();"
                + "if(e.stopImmediatePropagation)e.stopImmediatePropagation();}"
                + "}catch(e2){}}"
                + "document.addEventListener('click',handler,true);"
                + "}catch(e2){}})();";
        runOnUiThread(() -> {
            try {
                web.evaluateJavascript(js, null);
            } catch (Throwable ignored) {
            }
        });
    }

    private void resolveAndPlay(final long chatId, final long messageId) {
        TelegramNative.call(new TdApi.GetMessage(chatId, messageId)).whenComplete((res, err) -> {
            if (!(res instanceof TdApi.Message)) {
                notifyNativeFailed();
                return;
            }
            TdApi.Message msg = (TdApi.Message) res;
            final TelegramMediaLoader.Spec spec = TelegramMediaLoader.spec(msg.content);
            if (!spec.isVideoLike() || spec.playFileId == 0) {
                notifyNativeFailed();
                return;
            }
            final int fid = spec.playFileId;
            final String name = spec.fileName;
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(TelegramWebActivity.this, TelegramVideoActivity.class);
                    i.putExtra("fileId", fid);
                    i.putExtra("name", name);
                    startActivity(i);
                } catch (Throwable ignored) {
                }
            });
        });
    }

    private void notifyNativeFailed() {
        runOnUiThread(() -> {
            try {
                web.evaluateJavascript("window.__bpNativeFailed&&window.__bpNativeFailed()", null);
            } catch (Throwable ignored) {
            }
        });
    }

    private void fetchBlobAndSave(final String url, final String mime, final String name) {        final String js = "(function(){"
                + "var url=" + JSONObject.quote(url) + ";"
                + "var req=new XMLHttpRequest();"
                + "req.open('GET',url,true);req.responseType='arraybuffer';"
                + "req.onload=function(){try{"
                + "var bytes=new Uint8Array(req.response);var bin='';var c=0x8000;"
                + "for(var i=0;i<bytes.length;i+=c){bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+c));}"
                + "BioPulseWeb.saveBase64(btoa(bin)," + JSONObject.quote(mime == null ? "" : mime)
                + "," + JSONObject.quote(name) + ");"
                + "}catch(e){BioPulseWeb.saveBase64(''," + JSONObject.quote(mime == null ? "" : mime)
                + "," + JSONObject.quote(name) + ");}};"
                + "req.onerror=function(){BioPulseWeb.saveBase64('',"
                + JSONObject.quote(mime == null ? "" : mime) + "," + JSONObject.quote(name) + ");};"
                + "req.send();})();";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    /** Bridge used by the injected download script. Runs on the JS bridge thread. */
    private class WebBridge {
        @JavascriptInterface
        public void notify(String title, String body, String tag) {
            int id;
            if (tag != null && !tag.isEmpty()) {
                id = 0x54470000 ^ tag.hashCode();
            } else {
                id = 0x54470000 ^ (notifSeq++);
            }
            TelegramNotifications.post(TelegramWebActivity.this, id, title, body);
        }

        /** True when the native TDLib engine is signed in and can stream a video. */
        @JavascriptInterface
        public boolean canPlayNative() {
            return TelegramNative.isReady();
        }

        /**
         * Media state reported by the injected audio hook (Telegram Web A's audio/video element).
         * Drives the shared media notification — a seek bar with play/pause/stop — and, while audio
         * plays, the foreground service that keeps it audible with the app in the background.
         */
        @JavascriptInterface
        public void tgMediaState(String title, double position, double duration,
                                 boolean playing, boolean hasMedia, boolean isVideo) {
            if (!hasMedia) {
                MediaPlaybackService.stop(TelegramWebActivity.this);
                return;
            }
            MediaPlaybackService.setMediaOwner("telegram");
            MediaPlaybackService.setMediaTimeline(!isVideo);
            String name = (title == null || title.trim().isEmpty()) ? "Telegram" : title.trim();
            MediaPlaybackService.update(TelegramWebActivity.this, playing ? "playing" : "paused", name);
            if (Double.isFinite(position) && Double.isFinite(duration) && duration > 0) {
                MediaPlaybackService.reportProgress(
                        (long) (Math.max(0, position) * 1000.0),
                        (long) (duration * 1000.0));
            }
        }

        /** Shows the read time of your own tapped message, resolved through the native TDLib. */
        @JavascriptInterface
        public void showReadDate(String chatId, String messageId) {
            if (!TelegramNative.isReady()) {
                runOnUiThread(() -> toast("Read time needs the app's Telegram login"));
                return;
            }
            final long cid;
            final long mid;
            try {
                cid = Long.parseLong(chatId.trim());
                mid = Long.parseLong(messageId.trim());
            } catch (Throwable t) {
                return;
            }
            TelegramNative.getMessageReadDate(cid, mid, (readDate, text) -> {
                final String msg;
                if (readDate > 0) {
                    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault());
                    msg = "Seen: " + f.format(new Date(readDate * 1000L));
                } else {
                    msg = text != null ? text : "Read time not available";
                }
                runOnUiThread(() -> {
                    try {
                        new AlertDialog.Builder(TelegramWebActivity.this)
                                .setTitle("Message info")
                                .setMessage(msg)
                                .setPositiveButton("OK", null)
                                .show();
                    } catch (Throwable ignored) {
                    }
                });
            });
        }

        /** Shows a short on-screen message from the injected page script (fallback feedback). */
        @JavascriptInterface
        public void toastMsg(String m) {
            if (m == null || m.isEmpty()) return;
            runOnUiThread(() -> toast(m));
        }

        /** Opens the native streaming player for the tapped Web A video message. */
        @JavascriptInterface
        public boolean playNative(String chatId, String messageId) {
            if (!TelegramNative.isReady()) return false;
            long cid;
            long mid;
            try {
                cid = Long.parseLong(chatId.trim());
                mid = Long.parseLong(messageId.trim());
            } catch (Throwable t) {
                return false;
            }
            if (mid == 0) return false;
            resolveAndPlay(cid, mid);
            return true;
        }

        @JavascriptInterface
        public void beginDownload(String id, String name, String mime) {
            if (id == null) return;
            try {
                File dir = getExternalFilesDir("downloads");
                if (dir == null) dir = getFilesDir();
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, uniqueName(dir, safeName(name)));
                dlFiles.put(id, out);
                dlMeta.put(id, new String[]{out.getName(), mime == null ? "" : mime});
                dlStreams.put(id, new FileOutputStream(out));
            } catch (Throwable t) {
                Log.w(TAG, "begin download failed", t);
            }
        }

        @JavascriptInterface
        public void appendDownload(String id, String base64) {
            if (id == null || base64 == null || base64.isEmpty()) return;
            try {
                FileOutputStream fos = dlStreams.get(id);
                if (fos != null) {
                    fos.write(Base64.decode(base64, Base64.DEFAULT));
                }
            } catch (Throwable t) {
                Log.w(TAG, "append download failed", t);
            }
        }

        @JavascriptInterface
        public void finishDownload(String id) {
            if (id == null) return;
            FileOutputStream fos = dlStreams.remove(id);
            try {
                if (fos != null) fos.close();
            } catch (Throwable ignored) {
            }
            File file = dlFiles.remove(id);
            String[] meta = dlMeta.remove(id);
            if (file == null) return;
            String name = (meta != null && meta[0] != null) ? meta[0] : file.getName();
            String mime = meta != null ? meta[1] : null;
            try {
                publishDownload(file, name, mime);
            } catch (Throwable t) {
                Log.w(TAG, "finish download failed", t);
            }
        }

        @JavascriptInterface
        public void saveBase64(String base64, String mime, String name) {
            if (base64 == null || base64.isEmpty()) {
                runOnUiThread(() -> toast("Couldn't download file"));
                return;
            }
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                File dir = getExternalFilesDir("downloads");
                if (dir == null) dir = getFilesDir();
                if (!dir.exists()) dir.mkdirs();
                File out = new File(dir, uniqueName(dir, safeName(name)));
                FileOutputStream fos = new FileOutputStream(out);
                fos.write(data);
                fos.close();
                publishDownload(out, out.getName(), mime);
            } catch (Throwable t) {
                Log.w(TAG, "save blob failed", t);
                runOnUiThread(() -> toast("Couldn't save file"));
            }
        }
    }

    /** Copy the finished file into public Downloads / show a notification / offer to open it. */
    private void publishDownload(File file, String name, String mime) {
        if (file == null || !file.exists()) {
            runOnUiThread(() -> toast("Download failed"));
            return;
        }
        if (name == null || name.trim().isEmpty()) name = file.getName();
        if (!name.contains(".")) {
            String ext = extensionOf(mime);
            if (!".bin".equals(ext)) name = name + ext;
        }
        final String finalName = name;
        final String m = (mime == null || mime.isEmpty()) ? mimeOf(name) : mime;
        copyToPublicDownloads(file, finalName, m);
        final Uri shareUri = fileProviderUri(file);
        postDownloadNotification(finalName, shareUri, m);
        runOnUiThread(() -> {
            toast("Downloaded " + finalName);
            if (shareUri != null) openUri(shareUri, m);
        });
    }

    /** Drop a copy into the public Downloads folder so it shows in the Files app. */
    private void copyToPublicDownloads(File src, String name, String mime) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE,
                        (mime == null || mime.isEmpty()) ? mimeOf(name) : mime);
                Uri uri = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri != null) {
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    if (os != null) {
                        copyStream(src, os);
                        os.close();
                    }
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "public download copy failed", t);
        }
    }

    private static void copyStream(File src, OutputStream os) throws Exception {
        InputStream in = new FileInputStream(src);
        try {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        } finally {
            in.close();
        }
    }

    private Uri fileProviderUri(File file) {
        try {
            return FileProvider.getUriForFile(
                    this, getPackageName() + ".fileprovider", file);
        } catch (Throwable t) {
            Log.w(TAG, "provider uri failed", t);
            return null;
        }
    }

    private void openUri(Uri uri, String mime) {
        if (uri == null) {
            toast("Couldn't open file");
            return;
        }
        final String m = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, m);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(i, "Open with"));
        } catch (Throwable t) {
            Log.w(TAG, "open failed", t);
            toast("No app can open this file");
        }
    }

    private void postDownloadNotification(String name, Uri uri, String mime) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                return;
            }
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || uri == null) return;
            final String m = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
            Intent open = new Intent(Intent.ACTION_VIEW);
            open.setDataAndType(uri, m);
            open.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(open, "Open " + name);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            int id = 0x640000 + (dlNotifSeq++);
            PendingIntent pi = PendingIntent.getActivity(this, id, chooser, flags);
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, "tg_messages")
                    .setSmallIcon(R.drawable.ic_stat_telegram)
                    .setContentTitle(name)
                    .setContentText("Download complete — tap to open")
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .setShowWhen(true)
                    .setWhen(System.currentTimeMillis())
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);
            nm.notify(id, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "download notification failed", t);
        }
    }

    private static String uniqueName(File dir, String name) {
        if (name == null || name.trim().isEmpty()) name = "telegram_file";
        if (!new File(dir, name).exists()) return name;
        String ext = "";
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        if (dot > 0) ext = name.substring(dot);
        for (int i = 1; i < 1000; i++) {
            String candidate = base + " (" + i + ")" + ext;
            if (!new File(dir, candidate).exists()) return candidate;
        }
        return name;
    }

    private void openExternal(Uri uri) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Throwable ignored) {
        }
    }

    private boolean popupShouldOverride(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (scheme.equals("http") || scheme.equals("https")) return false;
        openExternal(uri);
        return true;
    }

    private void toast(String m) {
        Toast.makeText(this, m, Toast.LENGTH_SHORT).show();
    }

    private static String safeName(String name) {
        if (name == null || name.trim().isEmpty()) return "telegram_file";
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static String guessName(String url, String contentDisposition, String mime) {
        String name = URLUtil.guessFileName(url, contentDisposition, mime);
        if (name == null || name.trim().isEmpty() || name.equals("unknown")) {
            String ext = extensionOf(mime);
            name = "telegram_" + System.currentTimeMillis() + ext;
        }
        return safeName(name);
    }

    private static String extensionOf(String mime) {
        if (mime == null) return ".bin";
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        return ext == null ? ".bin" : "." + ext;
    }

    private static String mimeOf(String name) {
        String n = name == null ? "" : name.toLowerCase();
        String ext = n.contains(".") ? n.substring(n.lastIndexOf('.') + 1) : "";
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return mime == null ? "*/*" : mime;
    }
}
