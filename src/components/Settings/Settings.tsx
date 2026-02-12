import React, { useState, useMemo, useEffect } from "react";
import {
  EyeOpenIcon,
  EyeClosedIcon,
  TrashIcon,
  CopyIcon,
  GearIcon,
  InfoCircledIcon,
  VideoIcon,
  TimerIcon,
  LayersIcon,
  CheckIcon,
} from "@radix-ui/react-icons";
import { Card, CardContent, Input } from "../ui";
import { useSettingsStore } from "../../stores/settingsStore";
import { VideoFormat, VIDEO_FORMATS } from "../../lib/types";
import { cn, debounce } from "../../lib/utils";

export const Settings: React.FC = () => {
  const {
    settings,
    updateSettings,
    setApiKey,
    setBackendConfig,
    templates,
    deleteTemplate,
    duplicateTemplate,
  } = useSettingsStore();

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(settings.openaiApiKey || "");
  const [backendUrlInput, setBackendUrlInput] = useState(settings.backendUrl || "");
  const [accessCodeInput, setAccessCodeInput] = useState(settings.accessCode || "");
  const [googleClientId, setGoogleClientId] = useState(settings.googleClientId || "");
  const [googleApiKey, setGoogleApiKey] = useState(settings.googleApiKey || "");
  const [pexelsApiKey, setPexelsApiKey] = useState(settings.pexelsApiKey || "");
  const [anthropicApiKey, setAnthropicApiKey] = useState(settings.anthropicApiKey || "");
  const [assemblyaiApiKey, setAssemblyaiApiKey] = useState(settings.assemblyaiApiKey || "");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showAssemblyaiKey, setShowAssemblyaiKey] = useState(false);

  const hasBackendConfig = !!(settings.backendUrl && settings.accessCode);

  // Debounced store writes for each text input section
  const debouncedSaveApiKey = useMemo(
    () => debounce((key: string) => setApiKey(key), 800),
    [setApiKey]
  );
  const debouncedSaveBackend = useMemo(
    () => debounce((url: string, code: string) => setBackendConfig(url, code), 800),
    [setBackendConfig]
  );
  const debouncedSaveGoogle = useMemo(
    () =>
      debounce(
        (clientId: string, apiKey: string) =>
          updateSettings({ googleClientId: clientId, googleApiKey: apiKey }),
        800
      ),
    [updateSettings]
  );
  const debouncedSavePexels = useMemo(
    () => debounce((key: string) => updateSettings({ pexelsApiKey: key }), 800),
    [updateSettings]
  );
  const debouncedSaveAnthropic = useMemo(
    () => debounce((key: string) => updateSettings({ anthropicApiKey: key }), 800),
    [updateSettings]
  );
  const debouncedSaveAssemblyai = useMemo(
    () => debounce((key: string) => updateSettings({ assemblyaiApiKey: key }), 800),
    [updateSettings]
  );

  // Flush all pending saves on unmount
  useEffect(() => {
    return () => {
      debouncedSaveApiKey.flush();
      debouncedSaveBackend.flush();
      debouncedSaveGoogle.flush();
      debouncedSavePexels.flush();
      debouncedSaveAnthropic.flush();
      debouncedSaveAssemblyai.flush();
    };
  }, [
    debouncedSaveApiKey,
    debouncedSaveBackend,
    debouncedSaveGoogle,
    debouncedSavePexels,
    debouncedSaveAnthropic,
    debouncedSaveAssemblyai,
  ]);

  const toggleDefaultFormat = (format: VideoFormat) => {
    const current = settings.defaultFormats || [];
    const updated = current.includes(format)
      ? current.filter((f) => f !== format)
      : [...current, format];
    updateSettings({ defaultFormats: updated });
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="mb-4 flex items-center gap-4">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-lg",
                "bg-[hsl(var(--raised))]",
                "border border-[hsl(var(--glass-border))]"
              )}
            >
              <GearIcon className="h-5 w-5 text-[hsl(var(--text-ghost))]" />
            </div>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[hsl(var(--text))] sm:text-3xl">
            Settings
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
            Configure API keys, export preferences, and templates
          </p>
        </div>

        <div className="stagger space-y-6">
          {/* Backend Configuration (Recommended) */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(158_50%_15%/0.5)]"
                  )}
                >
                  <svg
                    className="h-5 w-5 text-[hsl(var(--success))]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <path d="M12 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Backend Server
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Connect to the shared backend (no API key needed)
                  </p>
                </div>
                {hasBackendConfig && (
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1",
                      "bg-[hsl(158_50%_15%/0.5)]",
                      "border border-[hsl(var(--success)/0.3)]"
                    )}
                  >
                    <CheckIcon className="h-3 w-3 text-[hsl(var(--success))]" />
                    <span className="text-xs font-medium text-[hsl(var(--success))]">
                      Connected
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                    Backend URL
                  </label>
                  <Input
                    value={backendUrlInput}
                    onChange={(e) => {
                      setBackendUrlInput(e.target.value);
                      debouncedSaveBackend(e.target.value, accessCodeInput);
                    }}
                    placeholder="http://localhost:3001"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                    Access Code
                  </label>
                  <Input
                    type="password"
                    value={accessCodeInput}
                    onChange={(e) => {
                      setAccessCodeInput(e.target.value);
                      debouncedSaveBackend(backendUrlInput, e.target.value);
                    }}
                    placeholder="Enter access code"
                  />
                </div>
                <p className="flex items-center gap-2 pt-2 text-xs text-[hsl(var(--text-subtle))]">
                  <InfoCircledIcon className="h-3.5 w-3.5" />
                  Get access code from the app administrator
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Direct API Configuration (Alternative) */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(185_50%_15%/0.5)]"
                  )}
                >
                  <span className="font-mono text-xs font-bold text-[hsl(var(--cyan))]">AI</span>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Direct OpenAI API
                    {hasBackendConfig && (
                      <span className="ml-2 text-xs font-normal text-[hsl(var(--text-muted))]">
                        (not needed if backend connected)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Use your own OpenAI API key directly
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                  OpenAI API Key
                </label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      debouncedSaveApiKey(e.target.value);
                    }}
                    placeholder="sk-..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[hsl(var(--text-ghost))] transition-colors hover:text-[hsl(var(--text))]"
                  >
                    {showApiKey ? (
                      <EyeClosedIcon className="h-4 w-4" />
                    ) : (
                      <EyeOpenIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="flex items-center gap-2 text-xs text-[hsl(var(--text-subtle))]">
                  <InfoCircledIcon className="h-3.5 w-3.5" />
                  Get your API key from{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--cyan))] hover:underline"
                  >
                    platform.openai.com
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Anthropic API (Text Generation) */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(25_50%_15%/0.5)]"
                  )}
                >
                  <span className="font-mono text-xs font-bold text-[hsl(25_80%_55%)]">CL</span>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Anthropic API (Claude)
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Used for AI text generation (snippets, captions)
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                  Anthropic API Key
                </label>
                <div className="relative">
                  <Input
                    type={showAnthropicKey ? "text" : "password"}
                    value={anthropicApiKey}
                    onChange={(e) => {
                      setAnthropicApiKey(e.target.value);
                      debouncedSaveAnthropic(e.target.value);
                    }}
                    placeholder="sk-ant-..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[hsl(var(--text-ghost))] transition-colors hover:text-[hsl(var(--text))]"
                  >
                    {showAnthropicKey ? (
                      <EyeClosedIcon className="h-4 w-4" />
                    ) : (
                      <EyeOpenIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="flex items-center gap-2 text-xs text-[hsl(var(--text-subtle))]">
                  <InfoCircledIcon className="h-3.5 w-3.5" />
                  Get your API key from{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--cyan))] hover:underline"
                  >
                    console.anthropic.com
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AssemblyAI API (Transcription) */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(210_50%_15%/0.5)]"
                  )}
                >
                  <span className="font-mono text-xs font-bold text-[hsl(210_80%_60%)]">AA</span>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    AssemblyAI (Transcription)
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Used for transcription with speaker diarization
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                  AssemblyAI API Key
                </label>
                <div className="relative">
                  <Input
                    type={showAssemblyaiKey ? "text" : "password"}
                    value={assemblyaiApiKey}
                    onChange={(e) => {
                      setAssemblyaiApiKey(e.target.value);
                      debouncedSaveAssemblyai(e.target.value);
                    }}
                    placeholder="Enter your AssemblyAI API key"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAssemblyaiKey(!showAssemblyaiKey)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-[hsl(var(--text-ghost))] transition-colors hover:text-[hsl(var(--text))]"
                  >
                    {showAssemblyaiKey ? (
                      <EyeClosedIcon className="h-4 w-4" />
                    ) : (
                      <EyeOpenIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="flex items-center gap-2 text-xs text-[hsl(var(--text-subtle))]">
                  <InfoCircledIcon className="h-3.5 w-3.5" />
                  Get your API key from{" "}
                  <a
                    href="https://www.assemblyai.com/app/account"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--cyan))] hover:underline"
                  >
                    assemblyai.com
                  </a>
                </p>
              </div>

              {/* Confidence threshold slider */}
              <div className="mt-5 space-y-3 border-t border-[hsl(var(--glass-border))] pt-5">
                <label className="block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                  Music / Noise Filter
                </label>
                <p className="text-xs text-[hsl(var(--text-muted))]">
                  Filter out low-confidence words from transcriptions (e.g. music lyrics, background
                  noise). Higher values filter more aggressively. Set to 0 to disable.
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.05"
                    value={settings.confidenceThreshold || 0}
                    onChange={(e) =>
                      updateSettings({ confidenceThreshold: parseFloat(e.target.value) })
                    }
                    className="flex-1 accent-[hsl(var(--cyan))]"
                  />
                  <span
                    className={cn(
                      "min-w-[3.5rem] rounded-md px-2 py-1 text-center font-mono text-sm tabular-nums",
                      "border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-base))]",
                      "text-[hsl(var(--text))]"
                    )}
                  >
                    {(settings.confidenceThreshold || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-[hsl(var(--text-ghost))]">
                  <span>Off</span>
                  <span>Light</span>
                  <span>Aggressive</span>
                </div>
                {(settings.confidenceThreshold || 0) > 0 && (
                  <p className="flex items-center gap-2 text-xs text-[hsl(var(--text-muted))]">
                    <InfoCircledIcon className="h-3.5 w-3.5 shrink-0" />
                    Applies in real time to transcripts with confidence data. Older transcripts may
                    need re-transcription.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Google Drive Integration */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(45_50%_15%/0.5)]"
                  )}
                >
                  <svg
                    className="h-5 w-5 text-[hsl(45_100%_60%)]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M4.433 22.396l4.83-8.387H22l-4.833 8.387H4.433zm7.192-9.471L6.79 4.167h6.795l4.833 8.758h-6.793zm6.795-8.758L22 4.167l-4.833 8.387-3.58-6.387 4.833-2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Google Drive Integration
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Optional: Import audio files directly from Google Drive
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                    Google Client ID
                  </label>
                  <Input
                    value={googleClientId}
                    onChange={(e) => {
                      setGoogleClientId(e.target.value);
                      debouncedSaveGoogle(e.target.value, googleApiKey);
                    }}
                    placeholder="your-client-id.apps.googleusercontent.com"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                    Google API Key
                  </label>
                  <Input
                    value={googleApiKey}
                    onChange={(e) => {
                      setGoogleApiKey(e.target.value);
                      debouncedSaveGoogle(googleClientId, e.target.value);
                    }}
                    placeholder="AIza..."
                  />
                </div>
                <p className="flex items-center gap-2 pt-2 text-xs text-[hsl(var(--text-subtle))]">
                  <InfoCircledIcon className="h-3.5 w-3.5" />
                  Get credentials from{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--cyan))] hover:underline"
                  >
                    Google Cloud Console
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pexels API (B-Roll) */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(165_50%_15%/0.5)]"
                  )}
                >
                  <VideoIcon className="h-5 w-5 text-[hsl(165_60%_50%)]" />
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Pexels API (B-Roll)
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Search and add stock videos to your clips
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                  Pexels API Key
                </label>
                <Input
                  type="password"
                  value={pexelsApiKey}
                  onChange={(e) => {
                    setPexelsApiKey(e.target.value);
                    debouncedSavePexels(e.target.value);
                  }}
                  placeholder="Enter your Pexels API key"
                />
                <p className="flex items-center gap-2 text-xs text-[hsl(var(--text-subtle))]">
                  <InfoCircledIcon className="h-3.5 w-3.5" />
                  Get a free API key from{" "}
                  <a
                    href="https://www.pexels.com/api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--cyan))] hover:underline"
                  >
                    pexels.com/api
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Default Export Formats */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(325_50%_15%/0.5)]"
                  )}
                >
                  <VideoIcon className="h-5 w-5 text-[hsl(var(--magenta))]" />
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Default Export Formats
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Select formats to export by default
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {Object.values(VIDEO_FORMATS).map((format) => {
                  const isSelected = settings.defaultFormats?.includes(format.id);
                  return (
                    <button
                      key={format.id}
                      onClick={() => toggleDefaultFormat(format.id)}
                      className={cn(
                        "rounded-lg p-3 text-left transition-colors",
                        "border",
                        isSelected
                          ? "border-[hsl(185_100%_50%/0.3)] bg-[hsl(185_50%_15%/0.3)]"
                          : cn(
                              "border-[hsl(var(--glass-border))]",
                              "bg-[hsl(var(--surface))]",
                              "hover:border-[hsl(0_0%_100%/0.12)]"
                            )
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[hsl(var(--text))]">
                          {format.name}
                        </span>
                        <div
                          className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors",
                            isSelected
                              ? "border-[hsl(var(--cyan))] bg-[hsl(var(--cyan))]"
                              : "border-[hsl(var(--glass-border))]"
                          )}
                        >
                          {isSelected && <CheckIcon className="h-2 w-2 text-[hsl(260_30%_6%)]" />}
                        </div>
                      </div>
                      <p className="font-mono text-[10px] text-[hsl(var(--text-muted))]">
                        {format.aspectRatio}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-[hsl(var(--text-ghost))]">
                        {format.useCases[0]}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Clip Settings */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(270_50%_15%/0.5)]"
                  )}
                >
                  <TimerIcon className="h-5 w-5 text-[hsl(var(--violet))]" />
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Clip Settings
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Default settings for new clips
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                    Default Clip Duration (sec)
                  </label>
                  <Input
                    type="number"
                    min={10}
                    max={60}
                    value={settings.defaultClipDuration}
                    onChange={(e) =>
                      updateSettings({
                        defaultClipDuration: parseInt(e.target.value) || 30,
                      })
                    }
                  />
                  <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
                    Recommended: 15-45 seconds for social media
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="mb-5 flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    "bg-[hsl(158_50%_15%/0.5)]"
                  )}
                >
                  <LayersIcon className="h-5 w-5 text-[hsl(var(--success))]" />
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-semibold text-[hsl(var(--text))]">
                    Video Templates
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Manage video style templates
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={cn(
                      "group flex items-center justify-between rounded-lg p-3 transition-colors",
                      "bg-[hsl(var(--surface))]",
                      "border border-[hsl(var(--glass-border))]",
                      "hover:border-[hsl(0_0%_100%/0.12)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 shrink-0 rounded-lg border border-[hsl(var(--glass-border))]"
                        style={{
                          background:
                            template.background.type === "gradient"
                              ? `linear-gradient(135deg, ${template.background.gradientColors?.[0] || "#000"}, ${template.background.gradientColors?.[1] || "#333"})`
                              : template.background.color || "#000",
                        }}
                      />
                      <div>
                        <p className="text-xs font-semibold text-[hsl(var(--text))]">
                          {template.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                              template.isBuiltIn
                                ? "bg-[hsl(var(--raised))] text-[hsl(var(--text-ghost))]"
                                : "bg-[hsl(270_50%_15%/0.5)] text-[hsl(var(--violet))]"
                            )}
                          >
                            {template.isBuiltIn ? "Built-in" : "Custom"}
                          </span>
                          <span className="text-xs text-[hsl(var(--text-muted))]">
                            {template.subtitle.animation} animation
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => duplicateTemplate(template.id)}
                        className={cn(
                          "rounded-lg p-2 transition-colors",
                          "text-[hsl(var(--text-ghost))]",
                          "hover:text-[hsl(var(--text))]",
                          "hover:bg-[hsl(var(--raised))]"
                        )}
                      >
                        <CopyIcon className="h-3.5 w-3.5" />
                      </button>
                      {!template.isBuiltIn && (
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className={cn(
                            "rounded-lg p-2 transition-colors",
                            "text-[hsl(var(--text-ghost))]",
                            "hover:text-[hsl(var(--error))]",
                            "hover:bg-[hsl(var(--error)/0.1)]"
                          )}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-sm font-bold text-[hsl(var(--text))]">
                    Podcastomatic
                  </p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">Version 0.1.0</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Built with React & Remotion
                  </p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--text-ghost))]">
                    AI powered by OpenAI Whisper & GPT-4
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
