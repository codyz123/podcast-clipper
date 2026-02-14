import React from "react";

interface ApplePodcastsCtaOverlayProps {
  podcast?: {
    name: string;
    coverImageUrl?: string;
    author?: string;
    category?: string;
  };
}

export const ApplePodcastsCtaOverlay: React.FC<ApplePodcastsCtaOverlayProps> = ({ podcast }) => {
  const podcastName = podcast?.name || "My Podcast";
  const author = podcast?.author || "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        padding: "8%",
        gap: 8,
      }}
    >
      {/* Card container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(12px)",
          borderRadius: 12,
          padding: "12px 14px",
          width: "100%",
          maxWidth: 180,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Cover art */}
        {podcast?.coverImageUrl ? (
          <img
            src={podcast.coverImageUrl}
            alt={podcastName}
            style={{
              width: 64,
              height: 64,
              borderRadius: "20%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "20%",
              background: "linear-gradient(135deg, #8B5CF6, #D946EF)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" opacity="0.8">
              <path d="M12 1C5.93 1 1 5.93 1 12s4.93 11 11 11 11-4.93 11-11S18.07 1 12 1zm0 16c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.76 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
            </svg>
          </div>
        )}

        {/* Podcast name */}
        <span
          style={{
            color: "white",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            width: "100%",
          }}
        >
          {podcastName}
        </span>

        {/* Author */}
        {author && (
          <span
            style={{
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: 9,
              fontFamily: "system-ui, -apple-system, sans-serif",
              textAlign: "center",
            }}
          >
            {author}
          </span>
        )}

        {/* Listen on Apple Podcasts */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 2,
          }}
        >
          {/* Apple Podcasts icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="ap-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F452FF" />
                <stop offset="100%" stopColor="#832BC1" />
              </linearGradient>
            </defs>
            <rect width="24" height="24" rx="5" fill="url(#ap-grad)" />
            <circle cx="12" cy="10" r="3" fill="white" />
            <path
              d="M12 14c-2.5 0-4.5 1.5-5 3.5C7.5 19.5 9.5 21 12 21s4.5-1.5 5-3.5c-.5-2-2.5-3.5-5-3.5z"
              fill="white"
            />
            <circle cx="12" cy="10" r="6" stroke="white" strokeWidth="1.5" fill="none" />
          </svg>
          <span
            style={{
              color: "rgba(255, 255, 255, 0.8)",
              fontSize: 8,
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontWeight: 500,
            }}
          >
            Listen on Apple Podcasts
          </span>
        </div>
      </div>
    </div>
  );
};
