import { http, HttpResponse } from "msw";

/**
 * Successful transcription response from OpenAI Whisper
 */
export const successfulTranscription = {
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
 * Default handlers for mocking OpenAI API
 */
export const handlers = [
  // Mock OpenAI Whisper API transcription endpoint
  http.post("https://api.openai.com/v1/audio/transcriptions", async ({ request }) => {
    // Validate authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return HttpResponse.json({ error: { message: "Invalid API key" } }, { status: 401 });
    }

    // Parse multipart form data to validate file was sent
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return HttpResponse.json({ error: { message: "No file provided" } }, { status: 400 });
    }

    // Return successful transcription
    return HttpResponse.json(successfulTranscription);
  }),
];

/**
 * Error handlers for specific test scenarios
 * Use with server.use() to override default handlers for specific tests
 */
export const errorHandlers = {
  rateLimitExceeded: http.post(
    "https://api.openai.com/v1/audio/transcriptions",
    () => HttpResponse.json({ error: { message: "Rate limit exceeded" } }, { status: 429 }),
    { once: true }
  ),

  serverError: http.post(
    "https://api.openai.com/v1/audio/transcriptions",
    () => HttpResponse.json({ error: { message: "Internal server error" } }, { status: 500 }),
    { once: true }
  ),

  invalidAudio: http.post(
    "https://api.openai.com/v1/audio/transcriptions",
    () => HttpResponse.json({ error: { message: "Invalid file format" } }, { status: 400 }),
    { once: true }
  ),

  timeout: http.post(
    "https://api.openai.com/v1/audio/transcriptions",
    async () => {
      // Simulate a timeout by delaying response
      await new Promise((resolve) => setTimeout(resolve, 35000));
      return HttpResponse.json(successfulTranscription);
    },
    { once: true }
  ),
};
