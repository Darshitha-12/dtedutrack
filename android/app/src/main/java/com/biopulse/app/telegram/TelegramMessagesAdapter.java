package com.biopulse.app.telegram;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.widget.Toast;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.recyclerview.widget.RecyclerView;

import com.biopulse.app.R;

import org.drinkless.tdlib.TdApi;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Renders chat messages as incoming (left) / outgoing (right) bubbles with text and media. */
public class TelegramMessagesAdapter extends RecyclerView.Adapter<TelegramMessagesAdapter.VH> {

    private static final int TYPE_IN = 0;
    private static final int TYPE_OUT = 1;

    private final List<TdApi.Message> items = new ArrayList<>();
    private final SimpleDateFormat timeFmt =
            new SimpleDateFormat("HH:mm", Locale.getDefault());

    /** Tapping an outgoing bubble asks for its read ("seen") time. */
    public interface OnOutgoingClick {
        void onOutgoing(TdApi.Message m);
    }

    private OnOutgoingClick onOutgoingClick;

    public void setOnOutgoingClick(OnOutgoingClick l) {
        onOutgoingClick = l;
    }

    public void submit(List<TdApi.Message> messages) {
        items.clear();
        if (messages != null) items.addAll(messages);
        notifyDataSetChanged();
    }

    public int append(TdApi.Message m) {
        items.add(m);
        int pos = items.size() - 1;
        notifyItemInserted(pos);
        return pos;
    }

    public long lastMessageId() {
        return items.isEmpty() ? 0 : items.get(items.size() - 1).id;
    }

    @Override
    public int getItemViewType(int position) {
        return items.get(position).isOutgoing ? TYPE_OUT : TYPE_IN;
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        int layout = viewType == TYPE_OUT
                ? R.layout.item_telegram_message_out
                : R.layout.item_telegram_message_in;
        View v = LayoutInflater.from(parent.getContext()).inflate(layout, parent, false);
        return new VH(v, viewType);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        TdApi.Message m = items.get(position);
        final Context ctx = h.itemView.getContext();
        final TelegramMediaLoader.Spec spec = TelegramMediaLoader.spec(m.content);

        reset(h);

        boolean hasMedia = false;

        if (spec.hasImage() && (spec.isPhoto() || spec.isSticker())) {
            hasMedia = true;
            h.mediaWrap.setVisibility(View.VISIBLE);
            h.mediaImage.setVisibility(View.VISIBLE);
            bindImage(h.mediaImage, spec.imageFileId);
            if (spec.isPhoto()) {
                final int fid = spec.imageFileId;
                h.mediaWrap.setOnClickListener(v -> openPhoto(ctx, fid));
            }
        } else if (spec.isVideoLike()) {
            hasMedia = true;
            h.mediaWrap.setVisibility(View.VISIBLE);
            if (spec.hasImage()) {
                h.mediaImage.setVisibility(View.VISIBLE);
                bindImage(h.mediaImage, spec.imageFileId);
            }
            h.mediaPlay.setVisibility(View.VISIBLE);
            if (spec.label != null && !spec.label.isEmpty()) {
                h.mediaBadge.setVisibility(View.VISIBLE);
                h.mediaBadge.setText(spec.label);
            }
            final int pid = spec.playFileId;
            final String vname = spec.fileName;
            h.mediaWrap.setOnClickListener(v -> openVideo(ctx, pid, vname));
        } else if (spec.isVoiceLike()) {
            hasMedia = true;
            h.audioRow.setVisibility(View.VISIBLE);
            boolean playing = TelegramAudioPlayer.isPlaying(spec.playFileId);
            h.audioPlay.setImageResource(playing
                    ? android.R.drawable.ic_media_pause
                    : android.R.drawable.ic_media_play);
            String label = "audio".equals(spec.kind)
                    ? spec.label
                    : ("Voice message " + spec.label).trim();
            h.audioLabel.setText(label);
            final int pid = spec.playFileId;
            final String alabel = label;
            h.audioRow.setOnClickListener(v -> TelegramAudioPlayer.toggle(pid, alabel));
        } else if (spec.isDocument()) {
            hasMedia = true;
            h.fileRow.setVisibility(View.VISIBLE);
            h.fileLabel.setText(spec.fileName);
            final int pid = spec.playFileId;
            final String name = spec.fileName;
            h.fileRow.setOnClickListener(v -> openDocument(ctx, pid, name));
        }

        String caption = TelegramMediaLoader.captionOf(m.content);
        if (caption != null && !caption.trim().isEmpty()) {
            h.text.setVisibility(View.VISIBLE);
            h.text.setText(caption);
        } else if (!hasMedia) {
            h.text.setVisibility(View.VISIBLE);
            h.text.setText(TelegramNative.contentText(m.content));
        }

        String suffix = timeFmt.format(new Date(m.date * 1000L));
        if (m.editDate > 0) suffix = "edited " + suffix;
        h.time.setText(suffix);

        // Tapping one of our own bubbles opens the read ("seen") time, like the official app.
        h.root.setOnClickListener(null);
        h.root.setClickable(false);
        if (m.isOutgoing && onOutgoingClick != null) {
            h.root.setClickable(true);
            h.root.setOnClickListener(v -> onOutgoingClick.onOutgoing(m));
        }
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    private void reset(VH h) {
        h.mediaWrap.setVisibility(View.GONE);
        h.mediaWrap.setOnClickListener(null);
        h.mediaImage.setImageDrawable(null);
        h.mediaImage.setTag(null);
        h.mediaImage.setVisibility(View.GONE);
        h.mediaPlay.setVisibility(View.GONE);
        h.mediaBadge.setVisibility(View.GONE);
        h.audioRow.setVisibility(View.GONE);
        h.audioRow.setOnClickListener(null);
        h.fileRow.setVisibility(View.GONE);
        h.fileRow.setOnClickListener(null);
        h.text.setVisibility(View.GONE);
    }

    private void bindImage(final ImageView iv, final int fileId) {
        iv.setTag(fileId);
        Bitmap cached = TelegramMediaLoader.get().cached(fileId);
        if (cached != null) {
            iv.setImageBitmap(cached);
            return;
        }
        TelegramMediaLoader.get().loadBitmap(fileId, bmp -> {
            Object tag = iv.getTag();
            if (bmp != null && tag instanceof Integer && ((Integer) tag) == fileId) {
                iv.setImageBitmap(bmp);
            }
        });
    }

    private void openPhoto(Context ctx, int fileId) {
        Intent i = new Intent(ctx, TelegramPhotoActivity.class);
        i.putExtra("fileId", fileId);
        ctx.startActivity(i);
    }

    private void openVideo(Context ctx, int fileId, String name) {
        Intent i = new Intent(ctx, TelegramVideoActivity.class);
        i.putExtra("fileId", fileId);
        if (name != null && !name.isEmpty()) i.putExtra("name", name);
        ctx.startActivity(i);
    }

    private void openDocument(Context ctx, int fileId, String name) {
        toast(ctx, "Downloading " + name + "…");
        TelegramMediaLoader.get().loadPath(fileId, (path, error) -> {
            if (path == null) {
                toast(ctx, "Couldn't download " + name);
                return;
            }
            publishAndOpen(ctx, path, name);
        });
    }

    /** Copies the file into the shared Downloads folder so Files/PDF apps can see it and opens it
     *  with the phone's own app — a PDF opens in the PDF viewer, not inside BioPulse. */
    private void publishAndOpen(Context ctx, String path, String name) {
        Uri uri = null;
        try {
            File src = new File(path);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mimeOf(name));
                Uri dst = ctx.getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (dst != null) {
                    java.io.InputStream in = new java.io.FileInputStream(src);
                    java.io.OutputStream out = ctx.getContentResolver().openOutputStream(dst);
                    if (out != null) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        out.close();
                    }
                    in.close();
                    uri = dst;
                }
            }
            if (uri == null) {
                uri = FileProvider.getUriForFile(
                        ctx, ctx.getPackageName() + ".fileprovider", src);
            }
        } catch (Throwable t) {
            try {
                uri = FileProvider.getUriForFile(
                        ctx, ctx.getPackageName() + ".fileprovider", new File(path));
            } catch (Throwable ignored) {
                Toast.makeText(ctx, "Couldn't open " + name, Toast.LENGTH_SHORT).show();
                return;
            }
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, mimeOf(name));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(Intent.createChooser(i, "Open with"));
        } catch (Throwable t) {
            Toast.makeText(ctx, "No app can open " + name, Toast.LENGTH_SHORT).show();
        }
    }

    private static void toast(Context ctx, String msg) {
        Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show();
    }


    private static String mimeOf(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".txt")) return "text/plain";
        return "*/*";
    }

    static class VH extends RecyclerView.ViewHolder {
        final LinearLayout root;
        final FrameLayout mediaWrap;
        final ImageView mediaImage;
        final ImageView mediaPlay;
        final TextView mediaBadge;
        final LinearLayout audioRow;
        final ImageView audioPlay;
        final TextView audioLabel;
        final LinearLayout fileRow;
        final TextView fileLabel;
        final TextView text;
        final TextView time;

        VH(@NonNull View v, int type) {
            super(v);
            root = (LinearLayout) v;
            mediaWrap = v.findViewById(R.id.tgMediaWrap);
            mediaImage = v.findViewById(R.id.tgMediaImage);
            mediaPlay = v.findViewById(R.id.tgMediaPlay);
            mediaBadge = v.findViewById(R.id.tgMediaBadge);
            audioRow = v.findViewById(R.id.tgAudioRow);
            audioPlay = v.findViewById(R.id.tgAudioPlay);
            audioLabel = v.findViewById(R.id.tgAudioLabel);
            fileRow = v.findViewById(R.id.tgFileRow);
            fileLabel = v.findViewById(R.id.tgFileLabel);
            if (type == TYPE_OUT) {
                text = v.findViewById(R.id.tgMsgTextOut);
                time = v.findViewById(R.id.tgMsgTimeOut);
            } else {
                text = v.findViewById(R.id.tgMsgTextIn);
                time = v.findViewById(R.id.tgMsgTimeIn);
            }
        }
    }
}
