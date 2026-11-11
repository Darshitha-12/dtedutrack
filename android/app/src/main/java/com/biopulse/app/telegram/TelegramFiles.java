package com.biopulse.app.telegram;

import android.app.Activity;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Saves a downloaded Telegram file into the phone's Downloads folder. */
final class TelegramFiles {

    private TelegramFiles() {
    }

    /** Copies {@code src} into public storage; returns true when it landed in Downloads. */
    static boolean saveToDownloads(Activity activity, String srcPath, String name, String mime) {
        if (srcPath == null) return false;
        File src = new File(srcPath);
        if (!src.exists()) return false;
        String safe = (name == null || name.trim().isEmpty()) ? "telegram_file" : name;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                Uri dst = activity.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (dst == null) return false;
                try (InputStream in = new FileInputStream(src);
                     OutputStream out = activity.getContentResolver().openOutputStream(dst)) {
                    if (out == null) return false;
                    copy(in, out);
                }
                return true;
            }
            File dir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "");
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, safe);
            try (InputStream in = new FileInputStream(src);
                 OutputStream os = new FileOutputStream(out)) {
                copy(in, os);
            }
            return true;
        } catch (Throwable t) {
            Toast.makeText(activity, "Couldn't save file", Toast.LENGTH_SHORT).show();
            return false;
        }
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        out.flush();
    }
}
