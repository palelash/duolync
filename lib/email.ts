import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error(
    "[email] RESEND_API_KEY is not set. Verification emails will not work.",
  );
}

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "Duolync <hello@duolync.com>";
const APP_NAME = "Duolync";

/** Absolute base URL used to build hosted-asset URLs in emails. */
function getAppBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/**
 * Centered logo block compatible with every major email client.
 * Uses the real hosted logo asset; falls back gracefully to "Duolync" alt text.
 * Gradient text (`background-clip:text`) is intentionally avoided — it is
 * silently discarded by Outlook and most webmail clients.
 */
function buildLogoBlock(baseUrl: string): string {
  const logoSrc = `${baseUrl}/duolync-logo.png`;
  return `
          <!-- ── Logo ── -->
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <a href="${baseUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
                <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                  <tr>
                    <td style="vertical-align:middle;padding-right:10px;">
                      <img src="${logoSrc}"
                           alt="${APP_NAME}"
                           width="44"
                           height="44"
                           style="display:block;width:44px;height:44px;border:0;outline:none;border-radius:10px;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-size:22px;font-weight:700;color:#a78bfa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;">${APP_NAME}</span>
                    </td>
                  </tr>
                </table>
              </a>
            </td>
          </tr>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
    console.error("[email] Resend error:", JSON.stringify(error));
    throw new Error(`[email] Send failed (${error.name}): ${error.message}`);
  }

  console.log(`[email] Verification email sent (id: ${data?.id}) → ${to}`);
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const firstName = name?.split(" ")[0] ?? "there";

  if (process.env.NODE_ENV !== "production") {
    console.log(`[email] Password reset URL for ${to}:\n  ${resetUrl}`);
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: buildPasswordResetEmailHtml({ firstName, resetUrl }),
  });

  if (error) {
    console.error("[email] Resend error:", JSON.stringify(error));
    throw new Error(`[email] Send failed (${error.name}): ${error.message}`);
  }

  console.log(`[email] Password reset email sent (id: ${data?.id}) → ${to}`);
}

// ---------------------------------------------------------------------------
// Claim notifications
// ---------------------------------------------------------------------------

export async function sendClaimSubmittedEmail({
  to,
  name,
  claimStatusUrl,
}: {
  to: string;
  name: string;
  claimStatusUrl: string;
}) {
  const firstName = name?.split(" ")[0] ?? "there";
  const baseUrl = getAppBaseUrl();

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Your ${APP_NAME} profile claim is under review`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0f;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
        ${buildLogoBlock(baseUrl)}
        <tr><td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:24px;">
              <div style="width:64px;height:64px;background:rgba(124,58,237,0.18);border:1px solid rgba(167,139,250,0.3);border-radius:16px;text-align:center;line-height:64px;font-size:28px;margin:0 auto;">&#9989;</div>
            </td></tr>
            <tr><td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;text-align:center;">Claim submitted</h1>
            </td></tr>
            <tr><td align="center" style="padding-bottom:28px;">
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.6;">
                Hi ${firstName},<br/>Your profile claim request has been received and is under review.<br/>We'll notify you once a decision has been made (usually 1–3 business days).
              </p>
            </td></tr>
            <tr><td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td align="center" style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:12px;">
                  <a href="${claimStatusUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">View claim status</a>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:28px;">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    console.error("[email] Claim submitted send error:", JSON.stringify(error));
  } else {
    console.log(`[email] Claim submitted email sent (id: ${data?.id}) → ${to}`);
  }
}

export async function sendClaimApprovedEmail({
  to,
  name,
  onboardingUrl,
}: {
  to: string;
  name: string;
  onboardingUrl: string;
}) {
  const firstName = name?.split(" ")[0] ?? "there";
  const baseUrl = getAppBaseUrl();

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Your ${APP_NAME} profile claim was approved!`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0f;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
        ${buildLogoBlock(baseUrl)}
        <tr><td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:24px;">
              <div style="width:64px;height:64px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);border-radius:16px;text-align:center;line-height:64px;font-size:28px;margin:0 auto;">&#127881;</div>
            </td></tr>
            <tr><td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;text-align:center;">Claim approved!</h1>
            </td></tr>
            <tr><td align="center" style="padding-bottom:28px;">
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.6;">
                Hi ${firstName},<br/>Great news! Your profile claim has been approved.<br/>The imported profile is now yours — complete your setup to get started.
              </p>
            </td></tr>
            <tr><td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td align="center" style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:12px;">
                  <a href="${onboardingUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Complete your profile</a>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:28px;">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    console.error("[email] Claim approved send error:", JSON.stringify(error));
  } else {
    console.log(`[email] Claim approved email sent (id: ${data?.id}) → ${to}`);
  }
}

export async function sendClaimRejectedEmail({
  to,
  name,
  reason,
  onboardingUrl,
}: {
  to: string;
  name: string;
  reason?: string;
  onboardingUrl: string;
}) {
  const firstName = name?.split(" ")[0] ?? "there";
  const baseUrl = getAppBaseUrl();
  const reasonHtml = reason
    ? `<tr><td align="center" style="padding-bottom:20px;"><div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px;font-size:14px;color:rgba(255,255,255,0.6);text-align:left;"><strong style="color:rgba(255,255,255,0.8);">Reason:</strong> ${reason}</div></td></tr>`
    : "";

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Update on your ${APP_NAME} profile claim`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0f;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
        ${buildLogoBlock(baseUrl)}
        <tr><td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;text-align:center;">Claim not approved</h1>
            </td></tr>
            <tr><td align="center" style="padding-bottom:20px;">
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.6;">
                Hi ${firstName},<br/>We reviewed your profile claim and were unable to approve it at this time.
              </p>
            </td></tr>
            ${reasonHtml}
            <tr><td align="center" style="padding-bottom:28px;">
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.45);text-align:center;line-height:1.6;">
                You can still create your own creator profile on ${APP_NAME} by completing onboarding.
              </p>
            </td></tr>
            <tr><td align="center">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr><td align="center" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;">
                  <a href="${onboardingUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Create your profile</a>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding-top:28px;">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    console.error("[email] Claim rejected send error:", JSON.stringify(error));
  } else {
    console.log(`[email] Claim rejected email sent (id: ${data?.id}) → ${to}`);
  }
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function buildVerificationEmailHtml({
  firstName,
  verificationUrl,
}: {
  firstName: string;
  verificationUrl: string;
}): string {
  const baseUrl = getAppBaseUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email – ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0f;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

          ${buildLogoBlock(baseUrl)}

          <!-- ── Card ── -->
          <tr>
            <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Icon -->
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="width:64px;height:64px;background:rgba(124,58,237,0.18);border:1px solid rgba(167,139,250,0.3);border-radius:16px;text-align:center;vertical-align:middle;line-height:64px;font-size:28px;">
                          &#9993;
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Heading -->
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Verify your email
                    </h1>
                  </td>
                </tr>

                <!-- Body text -->
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Hi ${firstName}, thanks for joining ${APP_NAME}!<br />
                      Click the button below to confirm your email address<br />and activate your account.
                    </p>
                  </td>
                </tr>

                <!-- CTA button -->
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:12px;">
                          <a href="${verificationUrl}"
                             target="_blank"
                             style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;letter-spacing:0.01em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                            Verify Email Address
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Fallback link -->
                <tr>
                  <td align="center" style="padding-bottom:4px;">
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Button not working? Paste this link into your browser:
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin:0;font-size:11px;color:rgba(167,139,250,0.7);text-align:center;word-break:break-all;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      ${verificationUrl}
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                This link expires in 24 hours. If you didn&apos;t create a ${APP_NAME} account,<br />you can safely ignore this email.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.2);text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
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

function buildPasswordResetEmailHtml({
  firstName,
  resetUrl,
}: {
  firstName: string;
  resetUrl: string;
}): string {
  const baseUrl = getAppBaseUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password – ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0f;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

          ${buildLogoBlock(baseUrl)}

          <!-- ── Card ── -->
          <tr>
            <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Icon -->
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="width:64px;height:64px;background:rgba(124,58,237,0.18);border:1px solid rgba(167,139,250,0.3);border-radius:16px;text-align:center;vertical-align:middle;line-height:64px;font-size:28px;">
                          &#128273;
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Heading -->
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Reset your password
                    </h1>
                  </td>
                </tr>

                <!-- Body text -->
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Hi ${firstName}, we received a request to reset your<br />
                      ${APP_NAME} password. Click the button below<br />to choose a new one.
                    </p>
                  </td>
                </tr>

                <!-- CTA button -->
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#7c3aed,#db2777);border-radius:12px;">
                          <a href="${resetUrl}"
                             target="_blank"
                             style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;letter-spacing:0.01em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Fallback link -->
                <tr>
                  <td align="center" style="padding-bottom:4px;">
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      Button not working? Paste this link into your browser:
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <p style="margin:0;font-size:11px;color:rgba(167,139,250,0.7);text-align:center;word-break:break-all;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                      ${resetUrl}
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                This link expires in 1 hour. If you didn&apos;t request a password reset,<br />you can safely ignore this email.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.2);text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
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
