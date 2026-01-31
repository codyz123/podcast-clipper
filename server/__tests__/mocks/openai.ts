import { vi } from "vitest";

/**
 * Mock transcription response from OpenAI Whisper
 */
export const mockTranscriptionResponse = {
  text: "Hello world this is a test transcription",
  language: "en",
  duration: 5.0,
  words: [
    { word: "Hello", start: 0.0, end: 0.5 },
    { word: "world", start: 0.5, end: 1.0 },
    { word: "this", start: 1.0, end: 1.3 },
    { word: "is", start: 1.3, end: 1.5 },
    { word: "a", start: 1.5, end: 1.6 },
    { word: "test", start: 1.6, end: 2.0 },
    { word: "transcription", start: 2.0, end: 3.0 },
  ],
};

/**
 * Create a mock OpenAI client
 */
export function createMockOpenAI() {
  return {
    audio: {
      transcriptions: {
        create: vi.fn().mockResolvedValue(mockTranscriptionResponse),
      },
    },
  };
}

/**
 * Mock the OpenAI module
 */
export function setupOpenAIMock() {
  vi.mock("openai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("openai")>();
    return {
      ...actual,
      default: vi.fn().mockImplementation(() => createMockOpenAI()),
    };
  });
}
