import React from "react";
import {
  PlayIcon,
  PauseIcon,
  TrackPreviousIcon,
  TrackNextIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
  EnterFullScreenIcon,
} from "@radix-ui/react-icons";
import { cn } from "../../../lib/utils";
import { formatTimestamp } from "../../../lib/formats";

interface TransportControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  isMuted: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onMuteToggle: () => void;
  onFullscreen?: () => void;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const TransportControls: React.FC<TransportControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  playbackSpeed,
  isMuted,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onMuteToggle,
  onFullscreen,
}) => {
  const handleSkipBack = () => {
    onSeek(Math.max(0, currentTime - 5));
  };

  const handleSkipForward = () => {
    onSeek(Math.min(duration, currentTime + 5));
  };

  const handleSpeedCycle = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    onSpeedChange(PLAYBACK_SPEEDS[nextIndex]);
  };

  return (
    <div className="flex items-center gap-4">
      {/* Skip back */}
      <button
        onClick={handleSkipBack}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
        title="Skip back 5s"
      >
        <TrackPreviousIcon className="h-4 w-4" />
      </button>

      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-all",
          isPlaying
            ? "bg-[hsl(var(--surface))] text-[hsl(var(--text))]"
            : "bg-[hsl(var(--cyan))] text-[hsl(var(--bg-base))] shadow-lg shadow-[hsl(var(--cyan)/0.3)]"
        )}
      >
        {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="ml-0.5 h-5 w-5" />}
      </button>

      {/* Skip forward */}
      <button
        onClick={handleSkipForward}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
        title="Skip forward 5s"
      >
        <TrackNextIcon className="h-4 w-4" />
      </button>

      {/* Time display */}
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="w-14 text-right text-[hsl(var(--text))]">
          {formatTimestamp(currentTime)}
        </span>
        <span className="text-[hsl(var(--text-ghost))]">/</span>
        <span className="w-14 text-[hsl(var(--text-muted))]">{formatTimestamp(duration)}</span>
      </div>

      {/* Speed control */}
      <button
        onClick={handleSpeedCycle}
        className="flex h-7 min-w-[42px] items-center justify-center rounded-md border border-[hsl(var(--border-subtle))] px-2 text-[10px] font-medium text-[hsl(var(--text-muted))] transition-colors hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text))]"
        title="Playback speed"
      >
        {playbackSpeed}x
      </button>

      {/* Mute toggle */}
      <button
        onClick={onMuteToggle}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          isMuted
            ? "text-[hsl(var(--text-ghost))]"
            : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
        )}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <SpeakerOffIcon className="h-4 w-4" /> : <SpeakerLoudIcon className="h-4 w-4" />}
      </button>

      {/* Fullscreen toggle */}
      {onFullscreen && (
        <button
          onClick={onFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--text))]"
          title="Fullscreen"
        >
          <EnterFullScreenIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
