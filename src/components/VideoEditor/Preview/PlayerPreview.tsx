/**
 * PlayerPreview — renders the Remotion composition in-browser via <Player>.
 *
 * Replaces EditorPreview with a true WYSIWYG preview: the exact same Remotion
 * composition code used for server-side rendering runs live in the editor.
 *
 * Interactive features (caption drag, animation drag/resize, snap guides) are
 * handled by InteractiveOverlay rendered on top of the Player.
 */

import React, { useRef, useMemo, useEffect } from "react";
import { Player, PlayerRef, CallbackListener } from "@remotion/player";
import { ClipVideo } from "../../../remotion/Composition";
import { MulticamClipVideo } from "../../../remotion/MulticamComposition";
import { InteractiveOverlay } from "./InteractiveOverlay";
import {
  buildPlayerProps,
  buildMulticamPlayerProps,
  type BuildPlayerPropsInput,
  type BuildMulticamPropsInput,
} from "../../../lib/buildPlayerProps";
import {
  Clip,
  VideoFormat,
  VIDEO_FORMATS,
  PodcastPerson,
  SpeakerNameFormat,
} from "../../../lib/types";
import { cn } from "../../../lib/utils";
import type { VideoSource as EpisodeVideoSource } from "../../../hooks/useEpisodes";
import type {
  SpeakerSegmentLike,
  LayoutMode,
  PipPosition,
  MulticamOverride,
} from "../../../../shared/multicamTransform";

interface PlayerPreviewProps {
  clip: Clip | null;
  currentTime: number;
  format: VideoFormat;
  onFormatChange: (format: VideoFormat) => void;
  isCaptionsTrackSelected?: boolean;
  isVideoTrackSelected?: boolean;
  onCaptionPositionChange?: (positionX: number, positionY: number) => void;
  onAnimationPositionChange?: (clipId: string, positionX: number, positionY: number) => void;
  onAnimationScaleChange?: (clipId: string, scale: number) => void;
  selectedClipId?: string | null;
  onSelectClip?: (clipId: string | null) => void;
  showUiOverlays?: boolean;
  showFormatControls?: boolean;
  showFormatInfo?: boolean;
  showFrameDecorations?: boolean;

  // Data for building composition props
  audioUrl: string;
  captionSpeakerSegments?: Array<{ startTime: number; endTime: number }>;
  speakerPeople?: PodcastPerson[];
  speakerDisplayMode?: "fill" | "circle";
  speakerNameFormat?: SpeakerNameFormat;
  podcast?: {
    name: string;
    coverImageUrl?: string;
    author?: string;
    category?: string;
  };

  // Multicam (optional)
  videoSources?: EpisodeVideoSource[];
  segments?: SpeakerSegmentLike[];
  layoutMode?: LayoutMode;
  pipEnabled?: boolean;
  pipPositions?: PipPosition[];
  pipScale?: number;
  defaultVideoSourceId?: string;
  multicamOverrides?: MulticamOverride[];
  transitionStyle?: "cut" | "crossfade";

  // Player control
  playerRef: React.RefObject<PlayerRef | null>;
  initialFrame?: number;
  playbackSpeed?: number;

  // Callbacks for time/play state sync (driven by Player events)
  onTimeUpdate?: (timeSeconds: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
}

export const PlayerPreview: React.FC<PlayerPreviewProps> = ({
  clip,
  currentTime,
  format,
  onFormatChange,
  isCaptionsTrackSelected = false,
  isVideoTrackSelected = false,
  onCaptionPositionChange,
  onAnimationPositionChange,
  onAnimationScaleChange,
  selectedClipId,
  onSelectClip,
  showUiOverlays = true,
  showFormatControls = true,
  showFormatInfo = true,
  showFrameDecorations = true,
  audioUrl,
  captionSpeakerSegments,
  speakerPeople,
  speakerDisplayMode = "fill",
  speakerNameFormat = "full-name",
  podcast,
  videoSources,
  segments,
  layoutMode = "active-speaker",
  pipEnabled = false,
  pipPositions = [],
  pipScale = 0.2,
  defaultVideoSourceId,
  multicamOverrides,
  transitionStyle = "cut",
  playerRef,
  initialFrame,
  playbackSpeed,
  onTimeUpdate,
  onPlayStateChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const formatConfig = VIDEO_FORMATS[format];
  const isMulticam = videoSources && videoSources.length > 0;

  // Build composition inputProps (memoized — Remotion requirement)
  const { props: inputProps, subtitleConfig } = useMemo(() => {
    if (!clip) {
      return {
        props: null,
        subtitleConfig: null,
      };
    }

    if (isMulticam && videoSources && segments) {
      const input: BuildMulticamPropsInput = {
        clip,
        format,
        audioUrl,
        captionSpeakerSegments,
        speakerPeople,
        speakerDisplayMode,
        speakerNameFormat,
        podcast,
        videoSources,
        segments,
        layoutMode,
        pipEnabled,
        pipPositions,
        pipScale,
        defaultVideoSourceId,
        multicamOverrides,
        transitionStyle,
      };
      return buildMulticamPlayerProps(input);
    }

    const input: BuildPlayerPropsInput = {
      clip,
      format,
      audioUrl,
      captionSpeakerSegments,
      speakerPeople,
      speakerDisplayMode,
      speakerNameFormat,
      podcast,
    };
    return buildPlayerProps(input);
  }, [
    clip,
    format,
    audioUrl,
    captionSpeakerSegments,
    speakerPeople,
    speakerDisplayMode,
    speakerNameFormat,
    podcast,
    isMulticam,
    videoSources,
    segments,
    layoutMode,
    pipEnabled,
    pipPositions,
    pipScale,
    defaultVideoSourceId,
    multicamOverrides,
    transitionStyle,
  ]);

  // Calculate preview dimensions to fit container while maintaining aspect ratio
  const previewMaxHeight = 380;
  const previewMaxWidth = 400;
  const aspectRatio = formatConfig.width / formatConfig.height;

  let previewWidth: number;
  let previewHeight: number;

  if (aspectRatio > 1) {
    previewWidth = Math.min(previewMaxWidth, previewMaxHeight * aspectRatio);
    previewHeight = previewWidth / aspectRatio;
  } else {
    previewHeight = previewMaxHeight;
    previewWidth = previewHeight * aspectRatio;
  }

  const displayScale = previewHeight / formatConfig.height;

  // Duration in frames
  const durationInFrames = inputProps?.durationInFrames || 1;
  const clipDuration = clip ? clip.endTime - clip.startTime : 0;

  // Attach Player event listeners (Remotion uses typed CallbackListener, not DOM EventListener)
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handleFrameUpdate: CallbackListener<"frameupdate"> = (e) => {
      onTimeUpdate?.(e.detail.frame / 30);
    };
    const handlePlay: CallbackListener<"play"> = () => {
      onPlayStateChange?.(true);
    };
    const handlePause: CallbackListener<"pause"> = () => {
      onPlayStateChange?.(false);
    };
    const handleEnded: CallbackListener<"ended"> = () => {
      onPlayStateChange?.(false);
      onTimeUpdate?.(0);
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    player.addEventListener("ended", handleEnded);

    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("ended", handleEnded);
    };
  }, [playerRef, onTimeUpdate, onPlayStateChange]);

  // Component to render (cast needed — same pattern as Root.tsx)

  const CompositionComponent = (
    isMulticam ? MulticamClipVideo : ClipVideo
  ) as React.ComponentType<any>;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[hsl(var(--bg-elevated))] p-4">
      {/* Format selector tabs */}
      {showFormatControls && (
        <div className="mb-4 flex items-center gap-1 rounded-lg bg-[hsl(var(--bg-surface))] p-1">
          {Object.values(VIDEO_FORMATS).map((f) => (
            <button
              key={f.id}
              onClick={() => onFormatChange(f.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                format === f.id
                  ? "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text))] shadow-sm"
                  : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
              )}
            >
              {f.aspectRatio}
            </button>
          ))}
        </div>
      )}

      {/* Preview container */}
      <div
        ref={containerRef}
        data-video-test="frame"
        className={cn(
          "relative overflow-hidden",
          showFrameDecorations && "rounded-lg shadow-lg",
          (isCaptionsTrackSelected || isVideoTrackSelected) &&
            "ring-2 ring-[hsl(var(--cyan))] ring-offset-2 ring-offset-[hsl(var(--bg-elevated))]"
        )}
        style={{
          width: previewWidth,
          height: previewHeight,
          backgroundColor: "#000",
        }}
      >
        {!clip || !inputProps ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-white/60">No clip selected</p>
          </div>
        ) : (
          <>
            <Player
              key={`${clip.id}-${format}`}
              ref={playerRef}
              component={CompositionComponent}
              inputProps={inputProps}
              compositionWidth={formatConfig.width}
              compositionHeight={formatConfig.height}
              durationInFrames={durationInFrames}
              fps={30}
              style={{ width: "100%", height: "100%" }}
              controls={false}
              numberOfSharedAudioTags={4}
              renderLoading={() => (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#000",
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Loading...</span>
                </div>
              )}
              {...(typeof initialFrame === "number" ? { initialFrame } : {})}
              {...(typeof playbackSpeed === "number" ? { playbackRate: playbackSpeed } : {})}
            />
            <InteractiveOverlay
              clip={clip}
              currentTime={currentTime}
              clipDuration={clipDuration}
              subtitleConfig={subtitleConfig}
              isCaptionsTrackSelected={isCaptionsTrackSelected}
              isVideoTrackSelected={isVideoTrackSelected}
              onCaptionPositionChange={onCaptionPositionChange}
              onAnimationPositionChange={onAnimationPositionChange}
              onAnimationScaleChange={onAnimationScaleChange}
              selectedClipId={selectedClipId ?? null}
              onSelectClip={onSelectClip ?? (() => {})}
              showUiOverlays={showUiOverlays}
              containerRef={containerRef}
              displayScale={displayScale}
            />
          </>
        )}
      </div>

      {/* Format info */}
      {showFormatInfo && (
        <div className="mt-3 text-center">
          <p className="text-xs text-[hsl(var(--text-muted))]">
            {formatConfig.name} ({formatConfig.width} x {formatConfig.height})
          </p>
          <p className="mt-0.5 text-[10px] text-[hsl(var(--text-tertiary))]">
            {formatConfig.useCases.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
};
