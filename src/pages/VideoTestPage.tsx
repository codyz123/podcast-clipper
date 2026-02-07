import React, { useEffect, useMemo, useState } from "react";
import { EditorPreview } from "../components/VideoEditor/Preview/EditorPreview";
import {
  VIDEO_TEST_CASES,
  VideoTestCase,
  buildVideoTestClip,
  buildVideoTestTemplate,
} from "../lib/videoTestFixtures";

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

  useEffect(() => {
    window.__VIDEO_TEST_SET__ = (config) => setTestCase(config);
    window.__VIDEO_TEST_READY__ = true;
    return () => {
      delete window.__VIDEO_TEST_SET__;
      delete window.__VIDEO_TEST_READY__;
    };
  }, []);

  const clip = useMemo(() => buildVideoTestClip(testCase), [testCase]);
  const template = useMemo(() => buildVideoTestTemplate(testCase), [testCase]);

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
        <EditorPreview
          clip={clip}
          currentTime={testCase.frames[0] ?? 0}
          format={testCase.format}
          template={template}
          onFormatChange={() => {}}
          isCaptionsTrackSelected={false}
          isVideoTrackSelected={false}
          previewScale={1}
          showUiOverlays={false}
          showFormatControls={false}
          showFormatInfo={false}
          showFrameDecorations={false}
        />
      </div>
    </div>
  );
};
