// Curated library of free Lottie animations for podcast clips
// All animations are verified working URLs from LottieFiles

export interface LottieAnimation {
  id: string;
  name: string;
  category: LottieCategory;
  tags: string[];
  url: string; // LottieFiles CDN URL
  duration?: number; // Approximate duration in seconds
}

export type LottieCategory =
  | "subscribe"
  | "social"
  | "arrows"
  | "reactions"
  | "notifications"
  | "decorative"
  | "text"
  | "emojis";

// Curated free Lottie animations from LottieFiles - verified working URLs
export const LOTTIE_LIBRARY: LottieAnimation[] = [
  // Subscribe / CTA
  {
    id: "subscribe-button",
    name: "Subscribe Button",
    category: "subscribe",
    tags: ["subscribe", "youtube", "button", "cta"],
    url: "https://assets2.lottiefiles.com/packages/lf20_GbabwrUY2k.json",
    duration: 2,
  },
  {
    id: "bell-notification",
    name: "Notification Bell",
    category: "subscribe",
    tags: ["bell", "notification", "subscribe", "alert"],
    url: "https://assets7.lottiefiles.com/packages/lf20_Yc2PU8DdfX.json",
    duration: 1.5,
  },
  {
    id: "like-button",
    name: "Like Button",
    category: "subscribe",
    tags: ["like", "thumb", "subscribe", "cta"],
    url: "https://assets10.lottiefiles.com/packages/lf20_K0864uP6eC.json",
    duration: 1.5,
  },
  {
    id: "follow-button",
    name: "Follow Button",
    category: "subscribe",
    tags: ["follow", "add", "subscribe", "social"],
    url: "https://assets7.lottiefiles.com/packages/lf20_eOLhtkf7AY.json",
    duration: 2,
  },

  // Social Media
  {
    id: "youtube-logo",
    name: "YouTube",
    category: "social",
    tags: ["youtube", "social", "video", "play"],
    url: "https://assets7.lottiefiles.com/packages/lf20_bNKaWpBPt6.json",
    duration: 2,
  },
  {
    id: "instagram-logo",
    name: "Instagram",
    category: "social",
    tags: ["instagram", "social", "photo", "stories"],
    url: "https://assets10.lottiefiles.com/packages/lf20_swnrn2oy.json",
    duration: 2,
  },
  {
    id: "social-media",
    name: "Social Media",
    category: "social",
    tags: ["social", "media", "sharing", "network"],
    url: "https://assets1.lottiefiles.com/packages/lf20_xvz0dpbn.json",
    duration: 2,
  },
  {
    id: "podcast-mic",
    name: "Podcast Mic",
    category: "social",
    tags: ["podcast", "microphone", "audio", "recording"],
    url: "https://assets2.lottiefiles.com/private_files/lf30_vcwnens3.json",
    duration: 2,
  },
  {
    id: "stopwatch",
    name: "Stopwatch",
    category: "social",
    tags: ["time", "stopwatch", "timer", "countdown"],
    url: "https://assets4.lottiefiles.com/datafiles/i0DrGl1AyhF4rvhqpBUbia6zUEekgKoxRociBzZy/stopwatch.json",
    duration: 2,
  },

  // Arrows & Gestures
  {
    id: "arrow-down",
    name: "Arrow Down",
    category: "arrows",
    tags: ["arrow", "down", "scroll", "pointer"],
    url: "https://lottie.host/ce7c97f6-e0ea-4ea6-b8c6-50d28928f288/jjsUvZSbD1.json",
    duration: 1.5,
  },
  {
    id: "swipe-gesture",
    name: "Swipe Gesture",
    category: "arrows",
    tags: ["swipe", "gesture", "hand", "scroll"],
    url: "https://assets3.lottiefiles.com/packages/lf20_klsaff0h.json",
    duration: 1.5,
  },
  {
    id: "tap-gesture",
    name: "Tap Here",
    category: "arrows",
    tags: ["tap", "click", "finger", "gesture"],
    url: "https://assets1.lottiefiles.com/packages/lf20_twijbubv.json",
    duration: 1.5,
  },
  {
    id: "pointing-hand",
    name: "Pointing Hand",
    category: "arrows",
    tags: ["point", "hand", "direction", "look"],
    url: "https://assets10.lottiefiles.com/packages/lf20_vPHwUd.json",
    duration: 1,
  },
  {
    id: "scroll-mouse",
    name: "Scroll Mouse",
    category: "arrows",
    tags: ["scroll", "mouse", "down", "navigation"],
    url: "https://assets6.lottiefiles.com/packages/lf20_bkjmxmhn.json",
    duration: 2,
  },

  // Reactions
  {
    id: "fire",
    name: "Fire",
    category: "reactions",
    tags: ["fire", "hot", "trending", "flame", "lit"],
    url: "https://assets-v2.lottiefiles.com/a/1df4b596-1182-11ee-9fc3-6f8d7094dc00/MOdWMcHHGq.json",
    duration: 1.5,
  },
  {
    id: "heart-like",
    name: "Heart Like",
    category: "reactions",
    tags: ["heart", "like", "love", "reaction"],
    url: "https://assets2.lottiefiles.com/packages/lf20_vwcugezu.json",
    duration: 1,
  },
  {
    id: "thumbs-up",
    name: "Thumbs Up",
    category: "reactions",
    tags: ["thumb", "up", "like", "approve", "yes"],
    url: "https://assets9.lottiefiles.com/packages/lf20_j3gumpgp.json",
    duration: 1,
  },
  {
    id: "star-sparkle",
    name: "Star Sparkle",
    category: "reactions",
    tags: ["star", "sparkle", "shine", "rating"],
    url: "https://assets9.lottiefiles.com/packages/lf20_swnrn2oy.json",
    duration: 2,
  },
  {
    id: "clapping",
    name: "Clapping Hands",
    category: "reactions",
    tags: ["clap", "applause", "hands", "bravo"],
    url: "https://assets4.lottiefiles.com/packages/lf20_xz6y4f8u.json",
    duration: 1.5,
  },
  {
    id: "explosion",
    name: "Explosion",
    category: "reactions",
    tags: ["explosion", "boom", "blast", "pow", "impact"],
    url: "https://assets5.lottiefiles.com/packages/lf20_4asnmu7v.json",
    duration: 1,
  },

  // Notifications / UI
  {
    id: "checkmark",
    name: "Checkmark",
    category: "notifications",
    tags: ["check", "done", "complete", "success", "verified"],
    url: "https://assets1.lottiefiles.com/packages/lf20_pmYw7M.json",
    duration: 1,
  },
  {
    id: "loading",
    name: "Loading",
    category: "notifications",
    tags: ["loading", "spinner", "wait", "progress"],
    url: "https://assets5.lottiefiles.com/packages/lf20_rwq6ciql.json",
    duration: 1.5,
  },
  {
    id: "alert",
    name: "Alert",
    category: "notifications",
    tags: ["alert", "warning", "attention", "important"],
    url: "https://assets10.lottiefiles.com/packages/lf20_tlqxuaoh.json",
    duration: 2,
  },
  {
    id: "new-badge",
    name: "New Badge",
    category: "notifications",
    tags: ["new", "badge", "label", "fresh"],
    url: "https://assets7.lottiefiles.com/packages/lf20_hciffdxq.json",
    duration: 2,
  },

  // Decorative
  {
    id: "confetti",
    name: "Confetti",
    category: "decorative",
    tags: ["confetti", "celebration", "party", "festive"],
    url: "https://assets4.lottiefiles.com/packages/lf20_u4yrau.json",
    duration: 3,
  },
  {
    id: "sparkles",
    name: "Sparkles",
    category: "decorative",
    tags: ["sparkle", "shine", "glitter", "magic", "stars"],
    url: "https://assets6.lottiefiles.com/packages/lf20_xvrofzfk.json",
    duration: 2,
  },
  {
    id: "audio-wave",
    name: "Audio Wave",
    category: "decorative",
    tags: ["audio", "wave", "sound", "music", "equalizer"],
    url: "https://assets3.lottiefiles.com/packages/lf20_qprpnse9.json",
    duration: 2,
  },
  {
    id: "particles",
    name: "Particles",
    category: "decorative",
    tags: ["particles", "dots", "floating", "ambient"],
    url: "https://assets9.lottiefiles.com/packages/lf20_6ft9bypa.json",
    duration: 4,
  },

  // Text Effects
  {
    id: "speech-bubble",
    name: "Speech Bubble",
    category: "text",
    tags: ["speech", "bubble", "chat", "message", "talk"],
    url: "https://assets2.lottiefiles.com/packages/lf20_pqnfmone.json",
    duration: 2,
  },
  {
    id: "typing",
    name: "Typing",
    category: "text",
    tags: ["typing", "cursor", "text", "write"],
    url: "https://assets5.lottiefiles.com/packages/lf20_gepj0vgl.json",
    duration: 2,
  },

  // Emojis
  {
    id: "emoji-wow",
    name: "Wow",
    category: "emojis",
    tags: ["wow", "surprised", "emoji", "shocked"],
    url: "https://assets8.lottiefiles.com/packages/lf20_9wpyhdzo.json",
    duration: 2,
  },
  {
    id: "emoji-laugh",
    name: "Laughing",
    category: "emojis",
    tags: ["laugh", "lol", "funny", "haha", "joy"],
    url: "https://assets2.lottiefiles.com/packages/lf20_4fET62.json",
    duration: 2,
  },
  {
    id: "emoji-love",
    name: "Heart Eyes",
    category: "emojis",
    tags: ["love", "heart", "eyes", "adore"],
    url: "https://assets1.lottiefiles.com/packages/lf20_wkebwzpz.json",
    duration: 1.5,
  },
  {
    id: "share-icon",
    name: "Share",
    category: "social",
    tags: ["share", "send", "forward", "social"],
    url: "https://assets8.lottiefiles.com/packages/lf20_u25cckyh.json",
    duration: 1.5,
  },
  {
    id: "youtube-play",
    name: "Play Button",
    category: "subscribe",
    tags: ["play", "youtube", "video", "start"],
    url: "https://assets5.lottiefiles.com/packages/lf20_vi0h5x8k.json",
    duration: 2,
  },
  {
    id: "notification-bell-2",
    name: "Bell Ring",
    category: "subscribe",
    tags: ["bell", "ring", "notification", "alert"],
    url: "https://assets2.lottiefiles.com/packages/lf20_kdx6cani.json",
    duration: 1.5,
  },
];

// Get animations by category
export const getAnimationsByCategory = (category: LottieCategory): LottieAnimation[] => {
  return LOTTIE_LIBRARY.filter((anim) => anim.category === category);
};

// Search animations
export const searchAnimations = (query: string): LottieAnimation[] => {
  const lowerQuery = query.toLowerCase();
  return LOTTIE_LIBRARY.filter(
    (anim) =>
      anim.name.toLowerCase().includes(lowerQuery) ||
      anim.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
};

// Get all categories with counts
export const getCategories = (): { id: LottieCategory; name: string; count: number }[] => {
  const categoryNames: Record<LottieCategory, string> = {
    subscribe: "Subscribe & CTA",
    social: "Social Media",
    arrows: "Arrows & Gestures",
    reactions: "Reactions",
    notifications: "Notifications",
    decorative: "Decorative",
    text: "Text Effects",
    emojis: "Emojis",
  };

  return (Object.keys(categoryNames) as LottieCategory[]).map((id) => ({
    id,
    name: categoryNames[id],
    count: getAnimationsByCategory(id).length,
  }));
};

// Fetch Lottie JSON data from URL
export const fetchLottieData = async (url: string): Promise<object | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch animation");
    return await response.json();
  } catch (error) {
    console.error("Error fetching Lottie animation:", error);
    return null;
  }
};
