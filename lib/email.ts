import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error(
    "[email] RESEND_API_KEY is not set. Verification emails will not work.",
  );
}

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "Duolync <hello@duolync.com>";
const APP_NAME = "Duolync";

export async function sendVerificationEmail({
  to,
  name,
  verificationUrl,
}: {
  to: string;
  name: string;
  verificationUrl: string;
}) {
  const firstName = name?.split(" ")[0] ?? "there";

  // In non-production, also print the URL to the server console so the
  // full flow can be tested without a verified sender domain.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[email] Verification URL for ${to}:\n  ${verificationUrl}`);
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Verify your ${APP_NAME} email address`,
    html: buildVerificationEmailHtml({ firstName, verificationUrl }),
  });

  if (error) {
    // Log the full error object — Resend errors carry a `name` field
    // (e.g. "missing_api_key", "validation_error") that's more useful
    // than the message alone.
    console.error("[email] Resend error:", JSON.stringify(error));
    throw new Error(`[email] Send failed (${error.name}): ${error.message}`);
  }

  console.log(`[email] Verification email sent (id: ${data?.id}) → ${to}`);
}

function buildVerificationEmailHtml({
  firstName,
  verificationUrl,
}: {
  firstName: string;
  verificationUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email – ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.08);border-radius:14px;width:44px;height:44px;text-align:center;vertical-align:middle;border:1px solid rgba(255,255,255,0.12);">
                    <span style="font-size:22px;font-weight:700;color:#ffffff;line-height:44px;">D</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:22px;font-weight:700;background:linear-gradient(135deg,#a78bfa,#ec4899);-webkit-background-clip:text;color:transparent;">${APP_NAME}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 36px;">

              <!-- Icon -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,rgba(167,139,250,0.2),rgba(236,72,153,0.2));border:1px solid rgba(167,139,250,0.3);display:inline-flex;align-items:center;justify-content:center;text-align:center;line-height:64px;font-size:28px;">
                      ✉️
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Heading -->
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;text-align:center;">
                Verify your email
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.6;">
                Hi ${firstName}, thanks for joining ${APP_NAME}! Click the button below to confirm your email address and activate your account.
              </p>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}"
                       style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c3aed,#db2777);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;letter-spacing:0.01em;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.35);text-align:center;">
                Button not working? Paste this link into your browser:
              </p>
              <p style="margin:0;font-size:11px;color:rgba(167,139,250,0.7);text-align:center;word-break:break-all;">
                ${verificationUrl}
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);line-height:1.6;">
                This link expires in 24 hours. If you didn't create a ${APP_NAME} account, you can safely ignore this email.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.2);">
                © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
