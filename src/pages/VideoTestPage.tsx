import React, { useEffect, useMemo, useRef, useState } from "react";
import { PlayerRef } from "@remotion/player";
import { PlayerPreview } from "../components/VideoEditor/Preview/PlayerPreview";
import { VIDEO_TEST_CASES, VideoTestCase, buildVideoTestClip } from "../lib/videoTestFixtures";

declare global {
  interface Window {
    __VIDEO_TEST_CONFIG__?: VideoTestCase;
    __VIDEO_TEST_READY__?: boolean;
    __VIDEO_TEST_SET__?: (config: VideoTestCase) => void;
  }
}

const fallbackCase = VIDEO_TEST_CASES[0];

export const VideoTestPage: React.FC = () => {
  const [testCase, setTestCase] = useState<VideoTestCase>(
    () => window.__VIDEO_TEST_CONFIG__ || fallbackCase
  );
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    window.__VIDEO_TEST_SET__ = (config) => setTestCase(config);
    window.__VIDEO_TEST_READY__ = true;
    return () => {
      delete window.__VIDEO_TEST_SET__;
      delete window.__VIDEO_TEST_READY__;
    };
  }, []);

  const clip = useMemo(() => buildVideoTestClip(testCase), [testCase]);
  const initialFrame = Math.floor((testCase.frames[0] ?? 0) * 30);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000",
      }}
    >
      <div data-video-test="preview">
        <PlayerPreview
          clip={clip}
          currentTime={testCase.frames[0] ?? 0}
          format={testCase.format}
          audioUrl=""
          playerRef={playerRef}
          initialFrame={initialFrame}
          onFormatChange={() => {}}
          isCaptionsTrackSelected={false}
          isVideoTrackSelected={false}
          showUiOverlays={false}
          showFormatControls={false}
          showFormatInfo={false}
          showFrameDecorations={false}
        />
      </div>
    </div>
  );
};
