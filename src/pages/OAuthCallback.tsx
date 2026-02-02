import React, { useEffect, useState } from "react";
import { Spinner } from "../components/ui/Progress";

type OAuthStatus = "processing" | "success" | "error";

export const OAuthCallback: React.FC = () => {
  const [status, setStatus] = useState<OAuthStatus>("processing");
  const [message, setMessage] = useState("Processing...");

  useEffect(() => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success") === "true";
    const error = params.get("error");
    const platform = params.get("platform") || "unknown";
    const accountName = params.get("accountName");

    // Post message to opener (parent window)
    if (window.opener) {
      window.opener.postMessage(
        {
          type: "oauth-callback",
          platform,
          success,
          accountName,
          error,
        },
        window.location.origin
      );

      // Update UI based on result
      if (success) {
        setStatus("success");
        setMessage(`Connected to ${platform}${accountName ? ` as ${accountName}` : ""}!`);
      } else {
        setStatus("error");
        setMessage(error || "Failed to connect. Please try again.");
      }

      // Close the popup after a short delay
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      // No opener - user navigated directly to this page
      setStatus("error");
      setMessage("This page should be opened as a popup. Please try connecting again.");
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(260_30%_6%)]">
      <div className="text-center">
        {status === "processing" && (
          <>
            <Spinner size="lg" className="mx-auto mb-4" />
            <p className="text-[hsl(var(--text-muted))]">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--success)/0.1)]">
              <svg
                className="h-6 w-6 text-[hsl(var(--success))]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-[hsl(var(--text))]">{message}</p>
            <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
              This window will close automatically...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--error)/0.1)]">
              <svg
                className="h-6 w-6 text-[hsl(var(--error))]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-[hsl(var(--text))]">{message}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 rounded-lg bg-[hsl(var(--surface))] px-4 py-2 text-sm text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-hover))]"
            >
              Close Window
            </button>
          </>
        )}
      </div>
    </div>
  );
};
