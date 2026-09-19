import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY || "";
export const isEmailConfigured = Boolean(apiKey);

const resend = isEmailConfigured ? new Resend(apiKey) : null;

const from = process.env.EMAIL_FROM || "BioPulse <onboarding@resend.dev>";

export async function sendOtpEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.log(`[email] OTP for ${to}: ${code}`);
    return { ok: false, error: "Email service is not configured (missing RESEND_API_KEY)." };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: "Your BioPulse verification code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <div style="font-size: 28px; margin-bottom: 8px;">🧬</div>
          <h2 style="color: #0f172a; margin: 0 0 8px;">Your verification code</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 20px;">
            Use this code to sign in to BioPulse. It expires in 10 minutes.
          </p>
          <div style="background: #0f172a; border-radius: 12px; padding: 20px; text-align: center;">
            <span style="color: #fff; font-size: 36px; letter-spacing: 10px; font-weight: 700;">${code}</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend send error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("Resend send exception:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send email" };
  }
}