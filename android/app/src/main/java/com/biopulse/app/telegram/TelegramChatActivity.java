package com.biopulse.app.telegram;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.graphics.drawable.RoundedBitmapDrawable;
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.biopulse.app.R;

import org.drinkless.tdlib.TdApi;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Native single-chat screen. Loads recent history from TDLib, appends live {@link TdApi.Message}
 * pushes for this chat, and sends outgoing text messages.
 */
public class TelegramChatActivity extends Activity implements TelegramRepo.Listener {

    private long chatId;
    private RecyclerView list;
    private EditText input;
    private ImageButton send;
    private TelegramMessagesAdapter adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_telegram_chat);

        chatId = getIntent().getLongExtra("chatId", 0L);
        String title = getIntent().getStringExtra("title");

        TextView titleBar = findViewById(R.id.tgChatTitleBar);
        list = findViewById(R.id.tgMsgList);
        input = findViewById(R.id.tgInput);
        send = findViewById(R.id.tgSend);

        if (!TextUtils.isEmpty(title)) {
            titleBar.setText(title);
        } else {
            String t = TelegramRepo.get().chatTitle(chatId);
            titleBar.setText(TextUtils.isEmpty(t) ? "Chat" : t);
        }

        final ImageView avatar = findViewById(R.id.tgChatAvatar);
        if (chatId != 0L) {
            TelegramAvatarCache.get().get(chatId, (cid, bmp) -> {
                if (bmp == null) return;
                RoundedBitmapDrawable rd =
                        RoundedBitmapDrawableFactory.create(getResources(), bmp);
                rd.setCircular(true);
                runOnUiThread(() -> avatar.setImageDrawable(rd));
            });
        }

        adapter = new TelegramMessagesAdapter();
        adapter.setOnOutgoingClick(this::showReadDate);
        LinearLayoutManager lm = new LinearLayoutManager(this);
        lm.setStackFromEnd(true);
        list.setLayoutManager(lm);
        list.setAdapter(adapter);

        send.setOnClickListener(v -> onSend());

        TelegramNative.init(getApplicationContext());
        TelegramMediaLoader.get().ensureRegistered();
        TelegramAudioPlayer.setListener(() -> runOnUiThread(() -> adapter.notifyDataSetChanged()));
        TelegramRepo.get().addListener(this);
        adapter.submit(TelegramRepo.get().messagesOf(chatId));
        TelegramNative.loadHistory(chatId, 50);
        scrollToBottom();
    }

    @Override
    protected void onResume() {
        super.onResume();
        adapter.submit(TelegramRepo.get().messagesOf(chatId));
        scrollToBottom();
        markRead();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        TelegramRepo.get().removeListener(this);
        TelegramAudioPlayer.setListener(null);
        TelegramAudioPlayer.stop();
    }

    @Override
    public void onChatsChanged() {
        // chat list changed; nothing to do on the open chat screen
    }

    @Override
    public void onMessageForChat(long id, TdApi.Message message) {
        if (id != chatId) return;
        runOnUiThread(() -> {
            adapter.append(message);
            scrollToBottom();
            markRead();
        });
    }

    private void onSend() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        input.setText("");
        TelegramNative.sendText(chatId, text);
    }

    private void markRead() {
        long[] ids = TelegramRepo.get().messageIdsOf(chatId);
        if (ids.length > 0) {
            TelegramNative.viewMessages(chatId, ids);
        }
    }

    /** Tapping one of our own messages shows when the other user read it (TDLib read date). */
    private void showReadDate(final TdApi.Message m) {
        if (m == null || !m.isOutgoing) return;
        TelegramNative.getMessageReadDate(chatId, m.id, new TelegramNative.ReadDateCallback() {
            @Override
            public void onReadDate(long readDate, String text) {
                String msg;
                if (readDate > 0) {
                    SimpleDateFormat f =
                            new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault());
                    msg = "Seen: " + f.format(new Date(readDate * 1000L));
                } else {
                    msg = text != null ? text : "Read time not available";
                }
                new AlertDialog.Builder(TelegramChatActivity.this)
                        .setTitle("Message info")
                        .setMessage(msg)
                        .setPositiveButton("OK", null)
                        .show();
            }
        });
    }

    private void scrollToBottom() {
        if (adapter.getItemCount() > 0) {
            list.post(() -> list.scrollToPosition(adapter.getItemCount() - 1));
        }
    }
}
