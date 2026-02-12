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

// Get the configured "from" email address
function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || "Podcastomatic <noreply@resend.dev>";
}

// Check if we're using the Resend testing domain
function isUsingTestingDomain(): boolean {
  const fromEmail = getFromEmail();
  return fromEmail.includes("@resend.dev");
}

// Email configuration status for diagnostics
export interface EmailConfigStatus {
  configured: boolean;
  usingTestingDomain: boolean;
  fromEmail: string;
  appUrl: string;
  warning?: string;
}

export function getEmailConfigStatus(): EmailConfigStatus {
  const hasApiKey = Boolean(process.env.RESEND_API_KEY);
  const usingTestingDomain = isUsingTestingDomain();
  const fromEmail = getFromEmail();
  const appUrl = getAppUrl();

  let warning: string | undefined;
  if (!hasApiKey) {
    warning = "RESEND_API_KEY is not configured. Emails will not be sent.";
  } else if (usingTestingDomain) {
    warning =
      "Using Resend testing domain (resend.dev). Emails can only be sent to the account owner. " +
      "To send to other recipients, verify your domain at resend.com/domains and set RESEND_FROM_EMAIL.";
  }

  return {
    configured: hasApiKey,
    usingTestingDomain,
    fromEmail,
    appUrl,
    warning,
  };
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
}: InvitationEmailParams): Promise<{
  success: boolean;
  error?: string;
  errorCode?: "NOT_CONFIGURED" | "TESTING_DOMAIN" | "API_ERROR" | "UNKNOWN";
  invitationUrl: string;
}> {
  const appUrl = getAppUrl();
  const signUpUrl = `${appUrl}?invite=${invitationToken}`;

  const client = getResendClient();
  if (!client) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping email send");
    return {
      success: false,
      error: "Email service not configured. Set RESEND_API_KEY to enable invitation emails.",
      errorCode: "NOT_CONFIGURED",
      invitationUrl: signUpUrl,
    };
  }

  // Check if using testing domain - warn but still try to send
  // (Resend will return an error if the recipient isn't the account owner)
  const usingTestingDomain = isUsingTestingDomain();
  if (usingTestingDomain) {
    console.warn(
      `[Email] Using Resend testing domain. Email to ${to} may fail unless they are the account owner.`
    );
  }

  const fromEmail = getFromEmail();
  console.warn(`[Email] Sending invitation to ${to} from ${fromEmail}`);

  try {
    const { data, error } = await client.emails.send({
      from: fromEmail,
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

      // Detect specific error cases and provide helpful messages
      let errorMessage = error.message;
      let errorCode: "API_ERROR" | "TESTING_DOMAIN" = "API_ERROR";

      // Check for common Resend errors
      if (
        error.message?.includes("can only send testing emails") ||
        error.message?.includes("verified domain") ||
        error.message?.includes("onboarding")
      ) {
        errorCode = "TESTING_DOMAIN";
        errorMessage =
          "Cannot send to this email with testing domain. Verify your domain at resend.com/domains and set RESEND_FROM_EMAIL.";
      }

      return { success: false, error: errorMessage, errorCode, invitationUrl: signUpUrl };
    }

    console.warn(`[Email] Invitation sent to ${to} (id: ${data?.id || "unknown"})`);
    return { success: true, invitationUrl: signUpUrl };
  } catch (err) {
    console.error("[Email] Error sending invitation:", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to send email";

    // Check if this is a testing domain restriction error
    const isTestingDomainError =
      errorMessage.includes("can only send testing emails") ||
      errorMessage.includes("verified domain");

    return {
      success: false,
      error: isTestingDomainError
        ? "Email service is in testing mode. To send invitations, verify your domain at resend.com/domains."
        : errorMessage,
      errorCode: isTestingDomainError ? "TESTING_DOMAIN" : "UNKNOWN",
      invitationUrl: signUpUrl,
    };
  }
}
