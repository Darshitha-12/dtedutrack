package com.biopulse.app.telegram;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.PlayerView;

import com.biopulse.app.R;

/**
 * Plays a Telegram video / animation / video message straight from TDLib's progressive download using
 * ExoPlayer, so playback starts immediately instead of after the whole file is fetched. A "Save"
 * button still downloads the complete file on demand.
 */
public class TelegramVideoActivity extends Activity {

    private ExoPlayer player;
    private PlayerView playerView;
    private ProgressBar progress;
    private int fileId;
    private boolean wasPlaying;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_telegram_video);

        playerView = findViewById(R.id.tgVideoView);
        progress = findViewById(R.id.tgVideoProgress);
        findViewById(R.id.tgVideoClose).setOnClickListener(v -> finish());
        TextView save = findViewById(R.id.tgVideoSave);
        save.setOnClickListener(v -> saveToPhone());

        fileId = getIntent().getIntExtra("fileId", 0);
        if (fileId == 0) {
            progress.setVisibility(View.GONE);
            return;
        }
        TelegramNative.init(getApplicationContext());
        TelegramMediaLoader.get().ensureRegistered();
        // Warm the whole file in the background so seeking/scrubbing doesn't stall on TDLib.
        TelegramNative.prefetchFile(fileId);

        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(20000, 180000, 2500, 5000)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();
        player = new ExoPlayer.Builder(this).setLoadControl(loadControl).build();
        playerView.setPlayer(player);
        playerView.setKeepScreenOn(true);

        DataSource.Factory factory = () -> new TdFileDataSource(fileId);
        MediaSource source = new ProgressiveMediaSource.Factory(factory)
                .createMediaSource(MediaItem.fromUri("td://file/" + fileId));
        player.setMediaSource(source);
        player.setWakeMode(androidx.media3.common.C.WAKE_MODE_NETWORK);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) {
                    progress.setVisibility(View.VISIBLE);
                } else if (state == Player.STATE_READY || state == Player.STATE_ENDED) {
                    progress.setVisibility(View.GONE);
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                progress.setVisibility(View.GONE);
                Toast.makeText(TelegramVideoActivity.this, "Can't play this video",
                        Toast.LENGTH_SHORT).show();
            }
        });
        player.setPlayWhenReady(true);
        player.prepare();
    }

    @Override
    protected void onStart() {
        super.onStart();
        // Resume exactly what was playing when the user left, so returning to the app is instant.
        if (player != null && wasPlaying) {
            player.setPlayWhenReady(true);
            progress.setVisibility(View.VISIBLE);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Leaving the screen releases the decoder; the play state is remembered for onStart.
        if (player != null) {
            wasPlaying = player.getPlayWhenReady() || player.isPlaying();
            player.setPlayWhenReady(false);
        }
    }

    private void saveToPhone() {
        String name = getIntent().getStringExtra("name");
        if (name == null || name.trim().isEmpty()) name = "telegram_video.mp4";
        if (!name.contains(".")) name = name + ".mp4";
        final String fname = name;
        Toast.makeText(this, "Preparing file…", Toast.LENGTH_SHORT).show();
        TelegramMediaLoader.get().loadPath(fileId, (path, error) -> {
            if (path == null) {
                Toast.makeText(this, "Download failed", Toast.LENGTH_SHORT).show();
                return;
            }
            boolean ok = TelegramFiles.saveToDownloads(
                    TelegramVideoActivity.this, path, fname, "video/mp4");
            Toast.makeText(this, ok ? "Saved to Downloads" : "Couldn't save",
                    Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            if (player != null) player.release();
        } catch (Throwable ignored) {
        }
    }
}
