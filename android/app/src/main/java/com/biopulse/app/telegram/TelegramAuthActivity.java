package com.biopulse.app.telegram;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.biopulse.app.R;

import org.drinkless.tdlib.TdApi;

/**
 * Native Telegram sign-in screen. Drives the TDLib authorization state machine:
 * phone number -> login code -> (optional) two-step password -> done.
 *
 * <p>The TDLib callbacks fire on a background thread; all view updates are posted to the main
 * thread via {@link #MAIN}.
 */
public class TelegramAuthActivity extends Activity implements TelegramNative.UpdateListener {

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private TextView title;
    private TextView subtitle;
    private TextView hint;
    private TextView error;
    private EditText phone;
    private EditText code;
    private EditText password;
    private Button submit;
    private ProgressBar progress;

    private String state = TelegramNative.STATE_STARTING;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_telegram_auth);

        title = findViewById(R.id.tgTitle);
        subtitle = findViewById(R.id.tgSubtitle);
        hint = findViewById(R.id.tgHint);
        error = findViewById(R.id.tgError);
        phone = findViewById(R.id.tgPhone);
        code = findViewById(R.id.tgCode);
        password = findViewById(R.id.tgPassword);
        submit = findViewById(R.id.tgSubmit);
        progress = findViewById(R.id.tgProgress);

        submit.setOnClickListener(v -> onSubmit());

        TelegramNative.init(getApplicationContext());
        TelegramNative.register(this);
        TelegramNative.addErrorListener(this::onTdError);
        applyState(TelegramNative.getState(), TelegramNative.getStateInfo());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        TelegramNative.unregister(this);
    }

    @Override
    public void onUpdate(TdApi.Object object) {
        if (object instanceof TdApi.UpdateAuthorizationState) {
            TdApi.AuthorizationState s =
                    ((TdApi.UpdateAuthorizationState) object).authorizationState;
            MAIN.post(() -> applyState(TelegramNative.getState(), TelegramNative.getStateInfo()));
        }
    }

    private void onTdError(String c, String message) {
        MAIN.post(() -> showError(message));
    }

    private void onSubmit() {
        error.setVisibility(View.GONE);
        switch (state) {
            case TelegramNative.STATE_PHONE: {
                String v = phone.getText().toString().trim();
                if (v.isEmpty()) {
                    showError("Enter your phone number");
                    return;
                }
                loading(true);
                TelegramNative.sendPhoneNumber(v);
                break;
            }
            case TelegramNative.STATE_CODE: {
                String v = code.getText().toString().trim();
                if (v.isEmpty()) {
                    showError("Enter the login code");
                    return;
                }
                loading(true);
                TelegramNative.sendCode(v);
                break;
            }
            case TelegramNative.STATE_PASSWORD: {
                String v = password.getText().toString();
                if (v.isEmpty()) {
                    showError("Enter your password");
                    return;
                }
                loading(true);
                TelegramNative.sendPassword(v);
                break;
            }
            default:
                break;
        }
    }

    private void applyState(String s, String info) {
        state = s;
        loading(false);
        error.setVisibility(View.GONE);
        phone.setVisibility(View.GONE);
        code.setVisibility(View.GONE);
        password.setVisibility(View.GONE);
        hint.setVisibility(View.GONE);
        submit.setVisibility(View.VISIBLE);

        switch (s) {
            case TelegramNative.STATE_PHONE:
                title.setText("Sign in to Telegram");
                subtitle.setText("Enter your phone number in international format.");
                phone.setVisibility(View.VISIBLE);
                submit.setText("Send code");
                break;
            case TelegramNative.STATE_CODE:
                title.setText("Enter the code");
                subtitle.setText("We sent a login code to your Telegram app.");
                code.setVisibility(View.VISIBLE);
                submit.setText("Verify");
                break;
            case TelegramNative.STATE_PASSWORD:
                title.setText("Two-step verification");
                subtitle.setText("Your account is protected with a password.");
                if (info != null && !info.isEmpty()) {
                    hint.setText("Hint: " + info);
                    hint.setVisibility(View.VISIBLE);
                }
                password.setVisibility(View.VISIBLE);
                submit.setText("Sign in");
                break;
            case TelegramNative.STATE_OTHER_DEVICE:
                title.setText("Confirm on another device");
                subtitle.setText("Open Telegram on another device to approve this login.");
                submit.setVisibility(View.GONE);
                break;
            case TelegramNative.STATE_READY: {
                boolean returnOnly = getIntent().getBooleanExtra("returnOnly", false);
                if (returnOnly) {
                    TelegramService.ensureRunning(getApplicationContext());
                } else {
                    startActivity(new android.content.Intent(this, TelegramChatsActivity.class));
                }
                finish();
                break;
            }
            case TelegramNative.STATE_STARTING:
                title.setText("Starting Telegram");
                subtitle.setText("Connecting to the Telegram network...");
                submit.setVisibility(View.GONE);
                break;
            case TelegramNative.STATE_UNAVAILABLE:
                title.setText("Telegram unavailable");
                subtitle.setText("The native Telegram component could not start on this device.");
                submit.setVisibility(View.GONE);
                break;
            default:
                title.setText("Telegram");
                subtitle.setText("Preparing...");
                submit.setVisibility(View.GONE);
                break;
        }
    }

    private void loading(boolean on) {
        progress.setVisibility(on ? View.VISIBLE : View.GONE);
        submit.setEnabled(!on);
    }

    private void showError(String message) {
        loading(false);
        error.setText(message == null ? "Something went wrong" : message);
        error.setVisibility(View.VISIBLE);
    }
}
