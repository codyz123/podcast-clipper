import { Resend } from "resend";

// Lazy-load Resend client to avoid throwing at module load when API key is missing
let resend: Resend | null = null;
function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Get the app URL for links in emails
function getAppUrl(): string {
  return process.env.APP_URL || "http://localhost:5173";
}

interface InvitationEmailParams {
  to: string;
  inviterName: string;
  podcastName: string;
  invitationToken: string;
}

export async function sendInvitationEmail({
  to,
  inviterName,
  podcastName,
  invitationToken,
}: InvitationEmailParams): Promise<{ success: boolean; error?: string }> {
  const client = getResendClient();
  if (!client) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping email send");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = getAppUrl();
  const signUpUrl = `${appUrl}?invite=${invitationToken}`;

  try {
    const { error } = await client.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Podcastomatic <noreply@resend.dev>",
      to: [to],
      subject: `${inviterName} invited you to collaborate on ${podcastName}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #141414; border-radius: 12px; border: 1px solid #2a2a2a; overflow: hidden;">
    <div style="padding: 32px;">
      <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">
        You're invited!
      </h1>
      <p style="color: #a0a0a0; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
        <strong style="color: #ffffff;">${inviterName}</strong> has invited you to collaborate on <strong style="color: #ffffff;">${podcastName}</strong>.
      </p>

      <a href="${signUpUrl}" style="display: inline-block; background-color: #00d4aa; color: #000000; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
        Accept Invitation
      </a>

      <p style="color: #666666; font-size: 14px; margin: 24px 0 0 0;">
        If you don't have an account yet, you'll be able to create one when you click the link above.
      </p>
    </div>

    <div style="padding: 16px 32px; background-color: #0d0d0d; border-top: 1px solid #2a2a2a;">
      <p style="color: #666666; font-size: 12px; margin: 0;">
        This invitation was sent by Podcastomatic. If you didn't expect this email, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>
      `.trim(),
      text: `
${inviterName} has invited you to collaborate on ${podcastName}.

Accept the invitation: ${signUpUrl}

If you don't have an account yet, you'll be able to create one when you click the link above.

This invitation was sent by Podcastomatic. If you didn't expect this email, you can safely ignore it.
      `.trim(),
    });

    if (error) {
      console.error("[Email] Failed to send invitation:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Invitation sent to ${to}`);
    return { success: true };
  } catch (err) {
    console.error("[Email] Error sending invitation:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}
