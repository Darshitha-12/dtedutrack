package com.biopulse.app.telegram;

import android.net.Uri;

import androidx.media3.common.C;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;

import org.drinkless.tdlib.TdApi;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;

/**
 * ExoPlayer {@link DataSource} backed by TDLib. Instead of waiting for the whole file to download
 * before playback (which is what left the native player stuck on a black screen), it asks TDLib for
 * the exact byte range the player is about to read and blocks only until that range is on disk. That
 * lets the media start as soon as the first chunk arrives and lets the player fetch the MP4 atom
 * table from the end of the file when needed.
 */
public final class TdFileDataSource implements DataSource {

    private static final int PRIORITY = 32;
    private static final long CHUNK = 1024 * 1024L;

    private final int fileId;
    private final Uri uri;

    private long totalSize = -1;
    private String path;
    private long readPos;
    private long endPos;
    private long availFrom;
    private long availTo;
    private RandomAccessFile raf;
    private String rafPath;

    public TdFileDataSource(int fileId) {
        this.fileId = fileId;
        this.uri = Uri.parse("td://file/" + fileId);
    }

    @Override
    public void addTransferListener(TransferListener transferListener) {
        // Progress is surfaced through TDLib updates; nothing to do here.
    }

    @Override
    public long open(DataSpec dataSpec) throws IOException {
        readPos = dataSpec.position;
        if (totalSize < 0) {
            totalSize = fetchSize();
        }
        if (totalSize <= 0) {
            throw new IOException("Unknown size for file " + fileId);
        }
        if (readPos > totalSize) {
            throw new IOException("Position past end of file");
        }
        long length = dataSpec.length;
        endPos = length == C.LENGTH_UNSET ? totalSize : Math.min(totalSize, readPos + length);
        ensure(readPos, Math.min(CHUNK, endPos - readPos));
        return endPos - readPos;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        if (length == 0) return 0;
        if (readPos >= endPos) return C.RESULT_END_OF_INPUT;
        long want = Math.min(length, endPos - readPos);
        ensure(readPos, want);
        String p = path;
        if (p == null) {
            throw new IOException("No local path for file " + fileId);
        }
        // Keep the handle open across reads: reopening the file for every 64 KB block was the main
        // cause of stutter on large videos.
        try {
            if (raf == null || !p.equals(rafPath)) {
                closeRaf();
                raf = new RandomAccessFile(new File(p), "r");
                rafPath = p;
            }
            raf.seek(readPos);
            int n = raf.read(buffer, offset, (int) Math.min(want, Integer.MAX_VALUE));
            if (n <= 0) {
                throw new IOException("Unexpected end of file at " + readPos);
            }
            readPos += n;
            return n;
        } catch (IOException e) {
            throw e;
        } catch (Throwable t) {
            throw new IOException("Read error at " + readPos, t);
        }
    }

    @Override
    public Uri getUri() {
        return uri;
    }

    @Override
    public void close() {
        closeRaf();
    }

    private void closeRaf() {
        RandomAccessFile r = raf;
        raf = null;
        rafPath = null;
        if (r != null) {
            try {
                r.close();
            } catch (Throwable ignored) {
            }
        }
    }

    private long fetchSize() {
        try {
            TdApi.Object res = TelegramNative.call(new TdApi.GetFile(fileId)).get();
            if (res instanceof TdApi.File) {
                TdApi.File f = (TdApi.File) res;
                if (f.local != null && f.local.path != null && !f.local.path.isEmpty()) {
                    path = f.local.path;
                }
                return f.size;
            }
        } catch (Throwable ignored) {
        }
        return -1;
    }

    private void ensure(long from, long len) throws IOException {
        if (len <= 0) return;
        long to = from + len;
        if (path != null && from >= availFrom && to <= availTo) {
            return;
        }
        long dlLen = Math.max(len, CHUNK);
        if (from + dlLen > totalSize) {
            dlLen = totalSize - from;
        }
        if (dlLen <= 0) {
            throw new IOException("Nothing left to download");
        }
        try {
            TdApi.Object res = TelegramNative.call(
                    new TdApi.DownloadFile(fileId, PRIORITY, from, dlLen, true)).get();
            if (!(res instanceof TdApi.File)) {
                throw new IOException("Download failed for file " + fileId);
            }
            TdApi.File f = (TdApi.File) res;
            if (f.local != null && f.local.path != null && !f.local.path.isEmpty()) {
                path = f.local.path;
            }
            if (path == null) {
                throw new IOException("No local path after download");
            }
            availFrom = from;
            availTo = from + dlLen;
        } catch (IOException e) {
            throw e;
        } catch (Throwable t) {
            throw new IOException("Download error for file " + fileId, t);
        }
    }

    /** Builds a fresh {@link TdFileDataSource} for each ExoPlayer load. */
    public static final class Factory implements DataSource.Factory {
        private final int fileId;

        public Factory(int fileId) {
            this.fileId = fileId;
        }

        @Override
        public DataSource createDataSource() {
            return new TdFileDataSource(fileId);
        }
    }
}
