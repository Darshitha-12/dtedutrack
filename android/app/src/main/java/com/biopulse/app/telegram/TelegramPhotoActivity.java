package com.biopulse.app.telegram;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageView;
import android.widget.ProgressBar;

import com.biopulse.app.R;

/** Full-screen Telegram photo viewer. */
public class TelegramPhotoActivity extends Activity {

    private ImageView image;
    private ProgressBar progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_telegram_photo);

        image = findViewById(R.id.tgPhotoImage);
        progress = findViewById(R.id.tgPhotoProgress);

        int fileId = getIntent().getIntExtra("fileId", 0);
        findViewById(R.id.tgPhotoClose).setOnClickListener(v -> finish());
        image.setOnClickListener(v -> finish());

        if (fileId == 0) {
            progress.setVisibility(View.GONE);
            return;
        }
        TelegramNative.init(getApplicationContext());
        TelegramMediaLoader.get().ensureRegistered();
        TelegramMediaLoader.get().loadBitmap(fileId, bmp -> {
            progress.setVisibility(View.GONE);
            if (bmp != null) image.setImageBitmap(bmp);
        });
    }
}
