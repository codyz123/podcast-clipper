import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { convertToWav } from "../../lib/audio-converter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, "../fixtures/audio");

describe("Audio Conversion", () => {
  describe("convertToWav()", () => {
    it("should convert AIFF to WAV format", async () => {
      const aiffBuffer = await readFile(join(FIXTURES_PATH, "short-5s.aiff"));
      const wavBuffer = await convertToWav(aiffBuffer, "test.aiff");

      // WAV files start with "RIFF" magic bytes
      expect(wavBuffer.slice(0, 4).toString()).toBe("RIFF");
      // And contain "WAVE" format identifier at bytes 8-11
      expect(wavBuffer.slice(8, 12).toString()).toBe("WAVE");
    });

    it("should produce 16kHz sample rate audio", async () => {
      const aiffBuffer = await readFile(join(FIXTURES_PATH, "short-5s.aiff"));
      const wavBuffer = await convertToWav(aiffBuffer, "test.aiff");

      // WAV header: bytes 24-27 contain sample rate as little-endian uint32
      const sampleRate = wavBuffer.readUInt32LE(24);
      expect(sampleRate).toBe(16000);
    });

    it("should produce 16-bit audio", async () => {
      const aiffBuffer = await readFile(join(FIXTURES_PATH, "short-5s.aiff"));
      const wavBuffer = await convertToWav(aiffBuffer, "test.aiff");

      // WAV header: bytes 34-35 contain bits per sample as little-endian uint16
      const bitsPerSample = wavBuffer.readUInt16LE(34);
      expect(bitsPerSample).toBe(16);
    });

    it("should produce valid audio data (non-empty)", async () => {
      const aiffBuffer = await readFile(join(FIXTURES_PATH, "short-5s.aiff"));
      const wavBuffer = await convertToWav(aiffBuffer, "test.aiff");

      // WAV file should be larger than just the header (44 bytes minimum)
      expect(wavBuffer.length).toBeGreaterThan(44);

      // For a 5 second audio at 16kHz, 16-bit mono, expect ~160KB
      // (16000 samples/sec * 5 sec * 2 bytes/sample = 160000 bytes)
      expect(wavBuffer.length).toBeGreaterThan(100000);
    });

    it("should handle medium-length audio", async () => {
      const aiffBuffer = await readFile(join(FIXTURES_PATH, "medium-30s.aiff"));
      const wavBuffer = await convertToWav(aiffBuffer, "test.aiff");

      expect(wavBuffer.slice(0, 4).toString()).toBe("RIFF");
      // 30 second audio should be ~960KB at 16kHz 16-bit mono
      expect(wavBuffer.length).toBeGreaterThan(500000);
    });

    it("should handle long audio files", async () => {
      const aiffBuffer = await readFile(join(FIXTURES_PATH, "long-2min.aiff"));
      const wavBuffer = await convertToWav(aiffBuffer, "test.aiff");

      expect(wavBuffer.slice(0, 4).toString()).toBe("RIFF");
      // 2 minute audio should be ~3.8MB at 16kHz 16-bit mono
      expect(wavBuffer.length).toBeGreaterThan(3000000);
    }, 30000); // Extended timeout for long file
  });
});
