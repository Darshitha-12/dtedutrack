package com.biopulse.app.telegram;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.biopulse.app.R;

import java.util.ArrayList;
import java.util.List;

/** Renders {@link TelegramRepo.ChatEntry} rows with avatar, title, preview, time and unread badge. */
public class TelegramChatsAdapter extends RecyclerView.Adapter<TelegramChatsAdapter.VH> {

    public interface OnChatClick {
        void onClick(TelegramRepo.ChatEntry entry);
    }

    private final List<TelegramRepo.ChatEntry> items = new ArrayList<>();
    private final OnChatClick click;

    public TelegramChatsAdapter(OnChatClick click) {
        this.click = click;
    }

    public void submit(List<TelegramRepo.ChatEntry> entries) {
        items.clear();
        if (entries != null) items.addAll(entries);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_telegram_chat, parent, false);
        return new VH(v);
    }

    @Override
    public void onBindViewHolder(@NonNull VH h, int position) {
        TelegramRepo.ChatEntry entry = items.get(position);
        h.name.setText(entry.title == null || entry.title.isEmpty() ? "Chat" : entry.title);
        h.last.setText(entry.lastText == null ? "" : entry.lastText);
        h.time.setText(formatTime(entry.lastDate));

        if (entry.unread > 0) {
            h.unread.setVisibility(View.VISIBLE);
            h.unread.setText(entry.unread > 99 ? "99+" : String.valueOf(entry.unread));
        } else {
            h.unread.setVisibility(View.GONE);
        }

        long chatId = entry.chat != null ? entry.chat.id : 0L;
        // initial-letter avatar fallback + colour
        h.avatar.setImageBitmap(null);
        h.avatarInitial.setText(initialOf(h.name.getText().toString()));
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(colorFor(chatId));
        h.avatarInitial.setBackground(bg);

        h.avatar.setVisibility(View.GONE);
        h.avatarInitial.setVisibility(View.VISIBLE);
        if (chatId != 0) {
            TelegramAvatarCache.get().get(chatId, (cid, bmp) -> {
                if (bmp == null) return;
                h.avatar.setImageBitmap(bmp);
                h.avatar.setVisibility(View.VISIBLE);
                h.avatarInitial.setVisibility(View.GONE);
            });
        }

        h.itemView.setOnClickListener(v -> {
            if (click != null) click.onClick(entry);
        });
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    private static String initialOf(String s) {
        if (s == null || s.isEmpty()) return "?";
        return String.valueOf(Character.toUpperCase(s.charAt(0)));
    }

    private static int colorFor(long seed) {
        int[] palette = {
                0xFFE57373, 0xFFF06292, 0xFFBA68C8, 0xFF9575CD, 0xFF7986CB,
                0xFF64B5F6, 0xFF4FC3F7, 0xFF4DD0E1, 0xFF4DB6AC, 0xFF81C784,
                0xFFAED581, 0xFFFFB74D, 0xFFFF8A65, 0xFFA1887F
        };
        int idx = (int) (Math.abs(seed) % palette.length);
        return palette[idx];
    }

    private static String formatTime(int unixSeconds) {
        if (unixSeconds <= 0) return "";
        java.util.Calendar then = java.util.Calendar.getInstance();
        then.setTimeInMillis(unixSeconds * 1000L);
        java.util.Calendar now = java.util.Calendar.getInstance();
        boolean sameDay = then.get(java.util.Calendar.YEAR) == now.get(java.util.Calendar.YEAR)
                && then.get(java.util.Calendar.DAY_OF_YEAR) == now.get(java.util.Calendar.DAY_OF_YEAR);
        java.text.SimpleDateFormat fmt;
        if (sameDay) {
            fmt = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault());
        } else {
            fmt = new java.text.SimpleDateFormat("dd/MM/yy", java.util.Locale.getDefault());
        }
        return fmt.format(then.getTime());
    }

    static class VH extends RecyclerView.ViewHolder {
        final LinearLayout root;
        final ImageView avatar;
        final TextView avatarInitial;
        final TextView name;
        final TextView time;
        final TextView last;
        final TextView unread;

        VH(@NonNull View v) {
            super(v);
            root = (LinearLayout) v;
            avatar = v.findViewById(R.id.tgChatAvatar);
            avatarInitial = v.findViewById(R.id.tgChatInitial);
            name = v.findViewById(R.id.tgChatName);
            time = v.findViewById(R.id.tgChatTime);
            last = v.findViewById(R.id.tgChatLast);
            unread = v.findViewById(R.id.tgChatUnread);
        }
    }
}
