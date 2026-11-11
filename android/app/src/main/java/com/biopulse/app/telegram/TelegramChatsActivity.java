package com.biopulse.app.telegram;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.biopulse.app.R;

import org.drinkless.tdlib.TdApi;

/**
 * Native chat list. Mirrors {@link TelegramRepo#chatList()} and refreshes whenever TDLib pushes
 * chat updates. Tapping a row opens {@link TelegramChatActivity}.
 */
public class TelegramChatsActivity extends Activity implements TelegramRepo.Listener {

    private RecyclerView list;
    private LinearLayout empty;
    private TelegramChatsAdapter adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_telegram_chats);

        list = findViewById(R.id.tgChatsList);
        empty = findViewById(R.id.tgChatsEmpty);
        TextView logout = findViewById(R.id.tgLogout);

        adapter = new TelegramChatsAdapter(entry -> {
            Intent i = new Intent(this, TelegramChatActivity.class);
            i.putExtra("chatId", entry.chat != null ? entry.chat.id : 0L);
            i.putExtra("title", entry.title);
            startActivity(i);
        });
        list.setLayoutManager(new LinearLayoutManager(this));
        list.setAdapter(adapter);

        logout.setOnClickListener(v -> {
            TelegramNative.logout();
            finish();
        });

        TelegramNative.init(getApplicationContext());
        TelegramRepo.get().addListener(this);
        if (!TelegramNative.isReady()) {
            startActivity(new Intent(this, TelegramAuthActivity.class));
            finish();
            return;
        }
        TelegramNative.loadChats(100);
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        TelegramRepo.get().removeListener(this);
    }

    @Override
    public void onChatsChanged() {
        runOnUiThread(this::refresh);
    }

    @Override
    public void onMessageForChat(long chatId, TdApi.Message message) {
        // handled by the open chat screen
    }

    private void refresh() {
        adapter.submit(TelegramRepo.get().chatList());
        boolean isEmpty = adapter.getItemCount() == 0;
        empty.setVisibility(isEmpty ? View.VISIBLE : View.GONE);
        list.setVisibility(isEmpty ? View.GONE : View.VISIBLE);
    }
}
