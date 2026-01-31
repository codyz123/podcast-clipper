import { describe, it, expect } from "vitest";
import {
  SUPPORTED_FORMATS,
  CONVERTIBLE_FORMATS,
  isSupported,
  needsConversion,
  isAiffExtension,
} from "../../lib/audio-formats.js";

describe("Audio Format Detection", () => {
  describe("SUPPORTED_FORMATS", () => {
    it.each([
      ["audio/mpeg", true],
      ["audio/mp3", true],
      ["audio/mp4", true],
      ["audio/x-m4a", true],
      ["audio/m4a", true],
      ["audio/wav", true],
      ["audio/x-wav", true],
      ["audio/webm", true],
      ["audio/flac", true],
      ["audio/ogg", true],
      ["audio/oga", true],
    ])("should include %s as supported format", (mime, expected) => {
      expect(SUPPORTED_FORMATS.has(mime)).toBe(expected);
    });

    it.each([
      ["video/mp4", false],
      ["text/plain", false],
      ["audio/aiff", false],
      ["application/octet-stream", false],
    ])("should NOT include %s as supported format", (mime, expected) => {
      expect(SUPPORTED_FORMATS.has(mime)).toBe(expected);
    });
  });

  describe("CONVERTIBLE_FORMATS", () => {
    it.each([
      ["audio/aiff", true],
      ["audio/x-aiff", true],
      ["audio/aif", true],
    ])("should include %s as convertible format", (mime, expected) => {
      expect(CONVERTIBLE_FORMATS.has(mime)).toBe(expected);
    });

    it.each([
      ["audio/mp3", false],
      ["audio/wav", false],
      ["audio/flac", false],
    ])("should NOT include %s as convertible format", (mime, expected) => {
      expect(CONVERTIBLE_FORMATS.has(mime)).toBe(expected);
    });
  });

  describe("isSupported()", () => {
    it("should return true for supported MIME types", () => {
      expect(isSupported("audio/mpeg")).toBe(true);
      expect(isSupported("audio/wav")).toBe(true);
      expect(isSupported("audio/flac")).toBe(true);
    });

    it("should return false for unsupported MIME types", () => {
      expect(isSupported("audio/aiff")).toBe(false);
      expect(isSupported("video/mp4")).toBe(false);
      expect(isSupported("")).toBe(false);
    });
  });

  describe("needsConversion()", () => {
    it("should return true for AIFF MIME types", () => {
      expect(needsConversion("audio/aiff", "test.mp3")).toBe(true);
      expect(needsConversion("audio/x-aiff", "test.mp3")).toBe(true);
      expect(needsConversion("audio/aif", "test.mp3")).toBe(true);
    });

    it("should return true for AIFF file extensions", () => {
      expect(needsConversion("application/octet-stream", "test.aif")).toBe(true);
      expect(needsConversion("application/octet-stream", "test.aiff")).toBe(true);
      expect(needsConversion("", "recording.AIFF")).toBe(true);
      expect(needsConversion("", "audio.AIF")).toBe(true);
    });

    it("should return false for supported formats", () => {
      expect(needsConversion("audio/mpeg", "test.mp3")).toBe(false);
      expect(needsConversion("audio/wav", "test.wav")).toBe(false);
      expect(needsConversion("audio/flac", "test.flac")).toBe(false);
    });

    it("should return false for non-AIFF files with unknown MIME", () => {
      expect(needsConversion("application/octet-stream", "test.mp3")).toBe(false);
      expect(needsConversion("", "test.wav")).toBe(false);
    });
  });

  describe("isAiffExtension()", () => {
    it.each([
      ["test.aif", true],
      ["test.aiff", true],
      ["TEST.AIF", true],
      ["TEST.AIFF", true],
      ["Recording.Aiff", true],
    ])("should detect AIFF extension in %s", (filename, expected) => {
      expect(isAiffExtension(filename)).toBe(expected);
    });

    it.each([
      ["test.mp3", false],
      ["test.wav", false],
      ["test.aiff.mp3", false],
      ["aiff.mp3", false],
      ["test", false],
    ])("should NOT detect AIFF extension in %s", (filename, expected) => {
      expect(isAiffExtension(filename)).toBe(expected);
    });
  });
});
