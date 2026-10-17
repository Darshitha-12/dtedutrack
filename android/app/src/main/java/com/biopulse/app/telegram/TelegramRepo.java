package com.biopulse.app.telegram;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.drinkless.tdlib.TdApi;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * In-memory mirror of the chats / messages TDLib pushes to us via updates. It registers itself as
 * a global {@link TelegramNative.UpdateListener}, so every native screen and the background
 * service reads from the same consistent snapshot.
 */
public final class TelegramRepo implements TelegramNative.UpdateListener {

    private static final String TAG = "BioPulseTgRepo";
    private static final int MAX_MESSAGES_PER_CHAT = 400;

    public interface Listener {
        /** Chat list contents changed (new/updated chats, unread counts, ordering). */
        void onChatsChanged();

        /** A message arrived in chatId (used by the open chat screen). */
        void onMessageForChat(long chatId, TdApi.Message message);
    }

    public static final class ChatEntry {
        public TdApi.Chat chat;
        public String title = "";
        public String lastText = "";
        public int lastDate;
        public int unread;
        public long lastMessageId;
        public long order;

        public ChatEntry copy(TdApi.Chat c) {
            ChatEntry e = new ChatEntry();
            e.chat = c;
            e.title = TelegramNative.chatTitle(c);
            e.lastText = lastText;
            e.lastDate = lastDate;
            e.unread = unread;
            e.lastMessageId = lastMessageId;
            e.order = order;
            return e;
        }
    }

    private static final class Holder {
        static final TelegramRepo INSTANCE = new TelegramRepo();
    }

    private final Map<Long, ChatEntry> chats = new LinkedHashMap<>();
    private final Map<Long, TreeMap<Long, TdApi.Message>> messages = new HashMap<>();
    private final Map<Long, TdApi.User> users = new HashMap<>();
    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean registered = false;
    // Default mute settings per scope (private/group/channel), in seconds-left; 0 means unmuted.
    private volatile int mutePrivate;
    private volatile int muteGroup;
    private volatile int muteChannel;

    private TelegramRepo() {
    }

    public static TelegramRepo get() {
        return Holder.INSTANCE;
    }

    /** Idempotent; called once from {@link TelegramNative#init}. */
    public synchronized void ensureRegistered() {
        if (registered) return;
        registered = true;
        TelegramNative.register(this);
    }

    public void addListener(Listener l) {
        listeners.addIfAbsent(l);
    }

    public void removeListener(Listener l) {
        listeners.remove(l);
    }

    public void clear() {
        chats.clear();
        messages.clear();
        users.clear();
        fire(1);
    }

    // ------------------------------------------------------------------ reads

    public List<ChatEntry> chatList() {
        List<ChatEntry> out = new ArrayList<>(chats.values());
        Collections.sort(out, (a, b) -> {
            long oa = Math.max(a.order, (long) a.lastDate * 1_000_000L);
            long ob = Math.max(b.order, (long) b.lastDate * 1_000_000L);
            if (oa != ob) return Long.compare(ob, oa);
            return Long.compare(b.lastDate, a.lastDate);
        });
        return out;
    }

    public ChatEntry chat(long chatId) {
        return chats.get(chatId);
    }

    public String chatTitle(long chatId) {
        ChatEntry e = chats.get(chatId);
        return e == null ? "" : e.title;
    }

    public List<TdApi.Message> messagesOf(long chatId) {
        TreeMap<Long, TdApi.Message> tree = messages.get(chatId);
        if (tree == null || tree.isEmpty()) return Collections.emptyList();
        return sortByDate(new ArrayList<>(tree.values()));
    }

    public List<TdApi.Message> allMessagesOf(long chatId) {
        return messagesOf(chatId);
    }

    private static List<TdApi.Message> sortByDate(List<TdApi.Message> list) {
        Collections.sort(list, Comparator.comparingLong(m -> m.id));
        return list;
    }

    public TdApi.User user(long id) {
        return users.get(id);
    }

    public String userName(TdApi.MessageSender sender) {
        if (sender instanceof TdApi.MessageSenderUser) {
            TdApi.MessageSenderUser u = (TdApi.MessageSenderUser) sender;
            TdApi.User user = users.get(u.userId);
            if (user != null) return firstName(user);
        }
        if (sender instanceof TdApi.MessageSenderChat) {
            TdApi.MessageSenderChat sc = (TdApi.MessageSenderChat) sender;
            return chatTitle(sc.chatId);
        }
        return "";
    }

    public static String firstName(TdApi.User u) {
        if (u == null) return "";
        StringBuilder sb = new StringBuilder();
        if (u.firstName != null) sb.append(u.firstName);
        if (u.lastName != null && !u.lastName.isEmpty()) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(u.lastName);
        }
        return sb.toString();
    }

    public long[] messageIdsOf(long chatId) {
        TreeMap<Long, TdApi.Message> tree = messages.get(chatId);
        if (tree == null || tree.isEmpty()) return new long[0];
        long[] ids = new long[tree.size()];
        int i = 0;
        for (Long id : tree.keySet()) ids[i++] = id;
        return ids;
    }

    // ------------------------------------------------------------------ updates

    @Override
    public void onUpdate(TdApi.Object object) {
        if (object instanceof TdApi.UpdateNewMessage) {
            onNewMessage(((TdApi.UpdateNewMessage) object).message);
        } else if (object instanceof TdApi.UpdateNewChat) {
            onChat(((TdApi.UpdateNewChat) object).chat);
        } else if (object instanceof TdApi.UpdateChatLastMessage) {
            onChatLastMessage((TdApi.UpdateChatLastMessage) object);
        } else if (object instanceof TdApi.UpdateChatReadInbox) {
            onChatReadInbox((TdApi.UpdateChatReadInbox) object);
        } else if (object instanceof TdApi.UpdateUser) {
            TdApi.UpdateUser u = (TdApi.UpdateUser) object;
            if (u.user != null) users.put(u.user.id, u.user);
        } else if (object instanceof TdApi.UpdateBasicGroup) {
            TdApi.UpdateBasicGroup g = (TdApi.UpdateBasicGroup) object;
            if (g.basicGroup != null && g.basicGroup.memberCount == 0) {
                // nothing useful to cache
            }
        } else if (object instanceof TdApi.UpdateChatTitle) {
            TdApi.UpdateChatTitle t = (TdApi.UpdateChatTitle) object;
            ChatEntry e = chats.get(t.chatId);
            if (e != null && t.title != null) {
                e.title = t.title;
            }
            fire(1);
        } else if (object instanceof TdApi.UpdateChatPosition) {
            TdApi.UpdateChatPosition p = (TdApi.UpdateChatPosition) object;
            ChatEntry e = chats.get(p.chatId);
            if (e != null && p.position != null
                    && p.position.list instanceof TdApi.ChatListMain) {
                e.order = p.position.order;
            }
            fire(1);
        } else if (object instanceof TdApi.Message) {
            // Raw (non-update) message objects dispatched by loadHistory(): ingest without
            // touching unread counts — viewMessages() reconciles read state afterwards.
            addMessage(((TdApi.Message) object).chatId, (TdApi.Message) object);
        } else if (object instanceof TdApi.UpdateMessageEdited) {
            TdApi.UpdateMessageEdited ed = (TdApi.UpdateMessageEdited) object;
            TreeMap<Long, TdApi.Message> tree = messages.get(ed.chatId);
            if (tree != null) {
                TdApi.Message existing = tree.get(ed.messageId);
                if (existing != null) {
                    existing.editDate = ed.editDate;
                }
            }
        } else if (object instanceof TdApi.UpdateChatNotificationSettings) {
            TdApi.UpdateChatNotificationSettings u = (TdApi.UpdateChatNotificationSettings) object;
            ChatEntry e = chats.get(u.chatId);
            if (e != null && e.chat != null) {
                e.chat.notificationSettings = u.notificationSettings;
            }
        } else if (object instanceof TdApi.UpdateScopeNotificationSettings) {
            TdApi.UpdateScopeNotificationSettings u = (TdApi.UpdateScopeNotificationSettings) object;
            applyScope(u.scope, u.notificationSettings == null ? 0 : u.notificationSettings.muteFor);
        }
    }

    private void applyScope(TdApi.NotificationSettingsScope scope, int muteFor) {
        if (scope instanceof TdApi.NotificationSettingsScopePrivateChats) {
            mutePrivate = muteFor;
        } else if (scope instanceof TdApi.NotificationSettingsScopeGroupChats) {
            muteGroup = muteFor;
        } else if (scope instanceof TdApi.NotificationSettingsScopeChannelChats) {
            muteChannel = muteFor;
        }
    }

    /** Fetches the per-scope default notification settings so {@link #isMuted} can resolve defaults. */
    public void loadScopeSettings() {
        fetchScope(new TdApi.NotificationSettingsScopePrivateChats());
        fetchScope(new TdApi.NotificationSettingsScopeGroupChats());
        fetchScope(new TdApi.NotificationSettingsScopeChannelChats());
    }

    private void fetchScope(final TdApi.NotificationSettingsScope scope) {
        TelegramNative.call(new TdApi.GetScopeNotificationSettings(scope)).thenAccept(r -> {
            if (r instanceof TdApi.ScopeNotificationSettings) {
                applyScope(scope, ((TdApi.ScopeNotificationSettings) r).muteFor);
            }
        });
    }

    /**
     * True when the chat is muted right now (either by its own settings or, when it defers to the
     * defaults, by the mute setting of its scope). Used to suppress notifications for muted chats.
     */
    public boolean isMuted(long chatId) {
        ChatEntry e = chats.get(chatId);
        if (e == null || e.chat == null || e.chat.notificationSettings == null) return false;
        TdApi.ChatNotificationSettings s = e.chat.notificationSettings;
        int muteFor = s.useDefaultMuteFor ? scopeMuteFor(e.chat) : s.muteFor;
        return muteFor != 0;
    }

    private int scopeMuteFor(TdApi.Chat chat) {
        if (chat == null) return mutePrivate;
        if (chat.type instanceof TdApi.ChatTypePrivate) return mutePrivate;
        if (chat.type instanceof TdApi.ChatTypeSecret) return mutePrivate;
        if (chat.type instanceof TdApi.ChatTypeBasicGroup) return muteGroup;
        if (chat.type instanceof TdApi.ChatTypeSupergroup) {
            TdApi.ChatTypeSupergroup t = (TdApi.ChatTypeSupergroup) chat.type;
            return t.isChannel ? muteChannel : muteGroup;
        }
        return mutePrivate;
    }

    private void onChat(TdApi.Chat chat) {
        if (chat == null) return;
        ChatEntry existing = chats.get(chat.id);
        ChatEntry e = existing == null ? new ChatEntry() : existing;
        e.chat = chat;
        if (e.title.isEmpty() || e.title.equals("Chat") || e.title.equals("Private chat")) {
            e.title = TelegramNative.chatTitle(chat);
        } else if (chat.title != null && !chat.title.isEmpty()) {
            e.title = chat.title;
        }
        // last message from the chat object
        if (chat.lastMessage != null) {
            e.lastText = TelegramNative.contentText(chat.lastMessage.content);
            e.lastDate = chat.lastMessage.date;
            e.lastMessageId = chat.lastMessage.id;
        }
        chats.put(chat.id, e);
        fire(1);
    }

    private void onChatLastMessage(TdApi.UpdateChatLastMessage u) {
        ChatEntry e = chats.get(u.chatId);
        if (e == null) {
            e = new ChatEntry();
            e.chat = null;
            e.title = "";
            chats.put(u.chatId, e);
        }
        if (u.lastMessage != null) {
            addMessage(u.chatId, u.lastMessage);
            e.lastText = TelegramNative.contentText(u.lastMessage.content);
            e.lastDate = u.lastMessage.date;
            e.lastMessageId = u.lastMessage.id;
        }
        fire(1);
    }

    private void onChatReadInbox(TdApi.UpdateChatReadInbox u) {
        ChatEntry e = chats.get(u.chatId);
        if (e == null) {
            e = new ChatEntry();
            e.chat = null;
            chats.put(u.chatId, e);
        }
        e.unread = u.unreadCount;
        fire(1);
    }

    private void onNewMessage(TdApi.Message message) {
        if (message == null) return;
        addMessage(message.chatId, message);
        ChatEntry e = chats.get(message.chatId);
        if (e == null) {
            e = new ChatEntry();
            e.chat = null;
            e.title = "";
            chats.put(message.chatId, e);
        }
        // only bump preview if this is newer than what we have
        if (message.id > e.lastMessageId) {
            e.lastText = TelegramNative.contentText(message.content);
            e.lastDate = message.date;
            e.lastMessageId = message.id;
            if (!message.isOutgoing) {
                e.unread++;
            }
        }
        // notify per-chat screen listeners
        main.post(() -> {
            for (Listener l : listeners) {
                try {
                    l.onMessageForChat(message.chatId, message);
                } catch (Throwable ignored) {
                }
            }
        });
        fire(1);
    }

    private void addMessage(long chatId, TdApi.Message message) {
        TreeMap<Long, TdApi.Message> tree =
                messages.computeIfAbsent(chatId, k -> new TreeMap<>());
        tree.put(message.id, message);
        while (tree.size() > MAX_MESSAGES_PER_CHAT) {
            tree.remove(tree.firstKey());
        }
    }

    private void fire(final int kind) {
        if (listeners.isEmpty()) return;
        main.post(() -> {
            for (Listener l : listeners) {
                try {
                    l.onChatsChanged();
                } catch (Throwable ignored) {
                }
            }
        });
    }
}
