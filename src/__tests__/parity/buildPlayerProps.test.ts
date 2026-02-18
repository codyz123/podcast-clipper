/**
 * WYSIWYG parity unit tests for buildPlayerProps.
 *
 * Verifies that buildPlayerProps (client path) produces the same ClipVideoProps
 * as the server render route would for identical input data. Any difference here
 * means the editor preview and the rendered output diverge — breaking WYSIWYG.
 */

import { describe, it, expect, vi } from "vitest";

// Mock the api module to avoid browser-only globals (window.location)
vi.mock("../../lib/api", () => ({
  getMediaUrl: (url: string | undefined | null) => url || undefined,
}));

import { buildPlayerProps, type BuildPlayerPropsInput } from "../../lib/buildPlayerProps";
import { VIDEO_TEST_CASES, buildVideoTestClip } from "../../lib/videoTestFixtures";
import { resolveCaptionStyle, toSubtitleConfig, toWordTimings } from "../../lib/clipTransform";
import { computeWordGroups, speakerBreakIndicesFromTimes } from "../../lib/computeWordGroups";
import type { Clip, CaptionStyle, BackgroundConfig, Track, TrackClip } from "../../lib/types";

const FPS = 30;

/**
 * Build props the way the server render route does (render.ts lines 258-486).
 * This is the "reference" — what gets rendered and exported.
 */
function buildServerEquivalentProps(clip: Clip, format: string) {
  const clipStart = clip.startTime;
  const clipEnd = clip.endTime;
  const durationSeconds = Math.max(0.1, clipEnd - clipStart);
  const durationInFrames = Math.ceil(durationSeconds * FPS);

  const wordTimings = toWordTimings(clip.words, clipStart, clipEnd, FPS);

  const resolvedCaptionStyle = resolveCaptionStyle({
    captionStyle: clip.captionStyle as CaptionStyle | undefined,
    tracks: clip.tracks,
  });
  const subtitleConfig = toSubtitleConfig(resolvedCaptionStyle);

  const background: BackgroundConfig = clip.background || {
    type: "gradient",
    gradientColors: ["#667eea", "#764ba2"],
    gradientDirection: 135,
  };

  // Server always sets audioStartFrame/audioEndFrame
  const audioStartFrame = Math.floor(clipStart * FPS);
  const audioEndFrame = Math.ceil(clipEnd * FPS);

  // Server processes overlay tracks into frame-based format
  const overlayTracks = (clip.tracks || [])
    .slice()
    .sort((a: Track, b: Track) => (a.order ?? 0) - (b.order ?? 0))
    .filter((track: Track) => track.type === "video-overlay");

  const renderTracks = overlayTracks
    .map((track: Track) => {
      const clips = track.clips
        .filter(
          (c: TrackClip) =>
            (c.type === "animation" && c.assetUrl) ||
            (c.type === "image" && c.assetSource === "branding" && c.assetUrl)
        )
        .map((c: TrackClip) => {
          const startSeconds = Math.max(0, c.startTime ?? 0);
          const durationSec = Math.max(0, c.duration ?? 0);
          const startFrame = Math.floor(startSeconds * FPS);
          const durationFrames = Math.max(1, Math.ceil(durationSec * FPS));
          const availableFrames = Math.max(0, durationInFrames - startFrame);
          if (availableFrames <= 0) return null;

          return {
            id: c.id,
            type: c.type,
            startFrame,
            durationFrames: Math.min(durationFrames, availableFrames),
            assetUrl: c.assetUrl,
            assetSource: c.assetSource,
            positionX: c.positionX,
            positionY: c.positionY,
            scale: c.scale,
          };
        })
        .filter(Boolean);

      if (clips.length === 0) return null;
      return { id: track.id, type: "video-overlay" as const, order: track.order, clips };
    })
    .filter(Boolean);

  // Group boundaries
  let groupBoundaries: Array<{ start: number; end: number }> | undefined;
  // (no speaker segments in basic test cases)

  return {
    audioUrl: "",
    audioStartFrame,
    audioEndFrame,
    words: wordTimings,
    format,
    background,
    subtitle: subtitleConfig,
    durationInFrames,
    fps: FPS,
    tracks: renderTracks.length > 0 ? renderTracks : undefined,
    groupBoundaries,
    speaker: undefined,
  };
}

describe("buildPlayerProps WYSIWYG parity", () => {
  for (const testCase of VIDEO_TEST_CASES) {
    describe(`test case: ${testCase.id}`, () => {
      const clip = buildVideoTestClip(testCase);
      const input: BuildPlayerPropsInput = {
        clip,
        format: testCase.format,
        audioUrl: "",
      };

      const { props: clientProps, subtitleConfig } = buildPlayerProps(input);
      const serverProps = buildServerEquivalentProps(clip, testCase.format);

      it("durationInFrames matches server", () => {
        expect(clientProps.durationInFrames).toBe(serverProps.durationInFrames);
      });

      it("word timings match server", () => {
        expect(clientProps.words).toEqual(serverProps.words);
      });

      it("subtitle config matches server", () => {
        expect(clientProps.subtitle).toEqual(serverProps.subtitle);
        expect(subtitleConfig).toEqual(serverProps.subtitle);
      });

      it("background matches server", () => {
        expect(clientProps.background).toEqual(serverProps.background);
      });

      it("format matches server", () => {
        expect(clientProps.format).toBe(serverProps.format);
      });

      it("fps matches server", () => {
        expect(clientProps.fps).toBe(serverProps.fps);
      });

      it("audioStartFrame matches server", () => {
        expect(clientProps.audioStartFrame).toBe(serverProps.audioStartFrame);
      });

      it("audioEndFrame matches server", () => {
        expect(clientProps.audioEndFrame).toBe(serverProps.audioEndFrame);
      });

      it("tracks match server", () => {
        expect(clientProps.tracks).toEqual(serverProps.tracks);
      });

      it("groupBoundaries match server", () => {
        expect(clientProps.groupBoundaries).toEqual(serverProps.groupBoundaries);
      });

      it("speaker config matches server", () => {
        expect(clientProps.speaker).toEqual(serverProps.speaker);
      });
    });
  }

  describe("speaker break grouping parity", () => {
    it("produces identical groupBoundaries as server when breakOnSpeakerChange is enabled", () => {
      const clip = buildVideoTestClip(VIDEO_TEST_CASES[0]);
      // Enable speaker breaks
      clip.captionStyle = {
        ...clip.captionStyle!,
        breakOnSpeakerChange: true,
      };

      // Simulate two speaker segments
      const segments = [
        { startTime: clip.startTime, endTime: clip.startTime + 3 },
        { startTime: clip.startTime + 3, endTime: clip.endTime },
      ];

      const { props } = buildPlayerProps({
        clip,
        format: "9:16",
        audioUrl: "",
        captionSpeakerSegments: segments,
      });

      // Build server-equivalent
      const wordTimings = toWordTimings(clip.words, clip.startTime, clip.endTime, FPS);
      const captionStyle = resolveCaptionStyle(clip);
      const subtitleConfig = toSubtitleConfig(captionStyle);
      const breakIndices = speakerBreakIndicesFromTimes(segments, wordTimings, clip.startTime);
      const expectedGroups = computeWordGroups(
        wordTimings.length,
        subtitleConfig.wordsPerGroup,
        breakIndices
      );

      expect(props.groupBoundaries).toEqual(expectedGroups);
    });
  });

  describe("edge cases", () => {
    it("handles empty words array", () => {
      const clip = buildVideoTestClip(VIDEO_TEST_CASES[0]);
      clip.words = [];

      const { props } = buildPlayerProps({
        clip,
        format: "9:16",
        audioUrl: "",
      });

      expect(props.words).toEqual([]);
      expect(props.durationInFrames).toBeGreaterThan(0);
    });

    it("handles clip with tracks containing animations", () => {
      const clip = buildVideoTestClip(VIDEO_TEST_CASES[0]);
      clip.tracks = [
        {
          id: "track-1",
          type: "video-overlay",
          order: 0,
          clips: [
            {
              id: "anim-1",
              type: "animation",
              startTime: 0,
              duration: 5,
              assetUrl: "https://example.com/anim.json",
              assetSource: "lottie",
              positionX: 50,
              positionY: 50,
              scale: 1.5,
            } as TrackClip,
          ],
        } as Track,
      ];

      const { props } = buildPlayerProps({
        clip,
        format: "9:16",
        audioUrl: "",
      });

      expect(props.tracks).toBeDefined();
      expect(props.tracks!.length).toBe(1);
      const trackClip = props.tracks![0].clips[0];
      expect(trackClip.startFrame).toBe(0);
      expect(trackClip.durationFrames).toBe(Math.max(1, Math.round(5 * FPS)));
      expect(trackClip.positionX).toBe(50);
      expect(trackClip.positionY).toBe(50);
      expect(trackClip.scale).toBe(1.5);
    });

    it("handles clip with speaker track", () => {
      const clip = buildVideoTestClip(VIDEO_TEST_CASES[0]);
      clip.tracks = [
        ...(clip.tracks || []),
        {
          id: "speaker-track",
          type: "speaker",
          order: 0,
          clips: [
            {
              id: "sp-1",
              type: "animation",
              startTime: 0,
              duration: 5,
              assetId: "Speaker A",
              assetUrl: "person-123",
            } as TrackClip,
            {
              id: "sp-2",
              type: "animation",
              startTime: 5,
              duration: 5,
              assetId: "Speaker B",
              assetUrl: "person-456",
            } as TrackClip,
          ],
        } as Track,
      ];

      const now = new Date().toISOString();
      const speakerPeople = [
        {
          id: "person-123",
          podcastId: "pod-1",
          name: "Alice",
          role: "host" as const,
          photoUrl: "/photos/alice.jpg",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "person-456",
          podcastId: "pod-1",
          name: "Bob",
          role: "host" as const,
          photoUrl: "/photos/bob.jpg",
          createdAt: now,
          updatedAt: now,
        },
      ];

      const { props } = buildPlayerProps({
        clip,
        format: "9:16",
        audioUrl: "",
        speakerPeople,
        speakerDisplayMode: "circle",
        speakerNameFormat: "first-name",
      });

      expect(props.speaker).toBeDefined();
      expect(props.speaker!.displayMode).toBe("circle");
      expect(props.speaker!.nameFormat).toBe("first-name");
      expect(props.speaker!.clips.length).toBe(2);
      expect(props.speaker!.clips[0].speakerLabel).toBe("Speaker A");
      expect(props.speaker!.clips[0].colorIndex).toBe(0);
      expect(props.speaker!.clips[1].speakerLabel).toBe("Speaker B");
      expect(props.speaker!.clips[1].colorIndex).toBe(1);
      expect(props.speaker!.people.length).toBe(2);
    });

    it("handles all four video formats", () => {
      const formats = ["9:16", "16:9", "1:1", "4:5"] as const;
      for (const format of formats) {
        const clip = buildVideoTestClip(VIDEO_TEST_CASES[0]);
        const { props } = buildPlayerProps({ clip, format, audioUrl: "" });
        expect(props.format).toBe(format);
      }
    });

    it("handles custom caption position", () => {
      const clip = buildVideoTestClip(VIDEO_TEST_CASES[0]);
      clip.captionStyle = {
        ...clip.captionStyle!,
        positionX: 30,
        positionY: 80,
      };

      const { props } = buildPlayerProps({
        clip,
        format: "9:16",
        audioUrl: "",
      });

      expect(props.subtitle.positionX).toBe(30);
      expect(props.subtitle.positionY).toBe(80);
    });

    it("preserves caption animation types correctly", () => {
      const animationMap: Record<string, string> = {
        "word-by-word": "karaoke",
        karaoke: "karaoke",
        bounce: "pop",
        typewriter: "typewriter",
      };

      for (const [inputAnim, expectedAnim] of Object.entries(animationMap)) {
        const clip = buildVideoTestClip(VIDEO_TEST_CASES[0]);
        clip.captionStyle = {
          ...clip.captionStyle!,
          animation: inputAnim as CaptionStyle["animation"],
        };

        const { props } = buildPlayerProps({
          clip,
          format: "9:16",
          audioUrl: "",
        });

        expect(props.subtitle.animation).toBe(expectedAnim);
      }
    });
  });
});
