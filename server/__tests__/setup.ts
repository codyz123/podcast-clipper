import { vi, beforeAll, afterEach } from "vitest";

/**
 * Global test setup
 *
 * - Mocks OpenAI SDK for integration tests
 * - Sets default environment variables
 */

// Mock transcription response
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

// Create mock transcription function that can be configured per test
export const mockTranscriptionCreate = vi.fn().mockResolvedValue(mockTranscriptionResponse);

// Mock APIError class for error handling tests
class MockAPIError extends Error {
  status: number;
  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

// Mock OpenAI module
vi.mock("openai", () => {
  const OpenAIMock = vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: mockTranscriptionCreate,
      },
    },
  }));

  // Add static APIError property to the mock
  (OpenAIMock as any).APIError = MockAPIError;

  return {
    default: OpenAIMock,
    toFile: vi.fn().mockImplementation(async (buffer, filename, options) => {
      // Return a mock File-like object
      return {
        name: filename,
        type: options?.type || "audio/mpeg",
        size: buffer.length,
      };
    }),
  };
});

// Reset mocks after each test
afterEach(() => {
  mockTranscriptionCreate.mockClear();
  mockTranscriptionCreate.mockResolvedValue(mockTranscriptionResponse);
});

// Set default environment variables for tests
beforeAll(() => {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-api-key";
  process.env.ACCESS_CODE = process.env.ACCESS_CODE || "test-access-code";
});
