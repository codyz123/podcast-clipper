import React, { useState } from "react";
import {
  EyeOpenIcon,
  EyeClosedIcon,
  CheckIcon,
  TrashIcon,
  CopyIcon,
  GearIcon,
  InfoCircledIcon,
  VideoIcon,
  TimerIcon,
  LayersIcon,
} from "@radix-ui/react-icons";
import { Button, Card, CardContent, Input } from "../ui";
import { useSettingsStore } from "../../stores/settingsStore";
import { VideoFormat, VIDEO_FORMATS } from "../../lib/types";
import { cn } from "../../lib/utils";

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
  const [isSaved, setIsSaved] = useState(false);
  const [isBackendSaved, setIsBackendSaved] = useState(false);
  const [isGoogleSaved, setIsGoogleSaved] = useState(false);
  const [isPexelsSaved, setIsPexelsSaved] = useState(false);

  const hasBackendConfig = !!(settings.backendUrl && settings.accessCode);

  const handleSaveApiKey = () => {
    setApiKey(apiKeyInput);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleSaveBackendConfig = () => {
    setBackendConfig(backendUrlInput, accessCodeInput);
    setIsBackendSaved(true);
    setTimeout(() => setIsBackendSaved(false), 2000);
  };

  const handleSaveGoogleCredentials = () => {
    updateSettings({ googleClientId, googleApiKey });
    setIsGoogleSaved(true);
    setTimeout(() => setIsGoogleSaved(false), 2000);
  };

  const handleSavePexelsApiKey = () => {
    updateSettings({ pexelsApiKey });
    setIsPexelsSaved(true);
    setTimeout(() => setIsPexelsSaved(false), 2000);
  };

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
                    onChange={(e) => setBackendUrlInput(e.target.value)}
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
                    onChange={(e) => setAccessCodeInput(e.target.value)}
                    placeholder="Enter access code"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <p className="flex items-center gap-2 text-xs text-[hsl(var(--text-subtle))]">
                    <InfoCircledIcon className="h-3.5 w-3.5" />
                    Get access code from the app administrator
                  </p>
                  <Button
                    onClick={handleSaveBackendConfig}
                    disabled={!backendUrlInput || !accessCodeInput}
                    variant={isBackendSaved ? "secondary" : "primary"}
                    size="sm"
                  >
                    {isBackendSaved ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
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
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
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
                  <Button
                    onClick={handleSaveApiKey}
                    disabled={!apiKeyInput}
                    variant={isSaved ? "secondary" : "primary"}
                  >
                    {isSaved ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      "Save Key"
                    )}
                  </Button>
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
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="your-client-id.apps.googleusercontent.com"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                    Google API Key
                  </label>
                  <Input
                    value={googleApiKey}
                    onChange={(e) => setGoogleApiKey(e.target.value)}
                    placeholder="AIza..."
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <p className="flex items-center gap-2 text-xs text-[hsl(var(--text-subtle))]">
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
                  <Button
                    onClick={handleSaveGoogleCredentials}
                    disabled={!googleClientId || !googleApiKey}
                    variant={isGoogleSaved ? "secondary" : "primary"}
                    size="sm"
                  >
                    {isGoogleSaved ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
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
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      type="password"
                      value={pexelsApiKey}
                      onChange={(e) => setPexelsApiKey(e.target.value)}
                      placeholder="Enter your Pexels API key"
                    />
                  </div>
                  <Button
                    onClick={handleSavePexelsApiKey}
                    disabled={!pexelsApiKey}
                    variant={isPexelsSaved ? "secondary" : "primary"}
                  >
                    {isPexelsSaved ? (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      "Save Key"
                    )}
                  </Button>
                </div>
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
                <div>
                  <label className="mb-2 block text-xs font-semibold tracking-wider text-[hsl(var(--text-subtle))] uppercase">
                    Auto-save Interval (sec)
                  </label>
                  <Input
                    type="number"
                    min={10}
                    max={300}
                    value={settings.autoSaveInterval}
                    onChange={(e) =>
                      updateSettings({
                        autoSaveInterval: parseInt(e.target.value) || 30,
                      })
                    }
                  />
                  <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
                    How often to save your work automatically
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
                    Podcast Clipper
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
