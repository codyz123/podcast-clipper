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
  const { settings, updateSettings, setApiKey, templates, deleteTemplate, duplicateTemplate } =
    useSettingsStore();

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(settings.openaiApiKey || "");
  const [googleClientId, setGoogleClientId] = useState(settings.googleClientId || "");
  const [googleApiKey, setGoogleApiKey] = useState(settings.googleApiKey || "");
  const [isSaved, setIsSaved] = useState(false);
  const [isGoogleSaved, setIsGoogleSaved] = useState(false);

  const handleSaveApiKey = () => {
    setApiKey(apiKeyInput);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleSaveGoogleCredentials = () => {
    updateSettings({ googleClientId, googleApiKey });
    setIsGoogleSaved(true);
    setTimeout(() => setIsGoogleSaved(false), 2000);
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
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className={cn(
              "w-11 h-11 rounded-lg flex items-center justify-center",
              "bg-[hsl(var(--raised))]",
              "border border-[hsl(var(--glass-border))]"
            )}>
              <GearIcon className="w-5 h-5 text-[hsl(var(--text-ghost))]" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(var(--text))] tracking-tight font-[family-name:var(--font-display)]">
            Settings
          </h1>
          <p className="text-[hsl(var(--text-muted))] mt-2 text-sm">
            Configure API keys, export preferences, and templates
          </p>
        </div>

        <div className="space-y-6 stagger">
          {/* API Configuration */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-[hsl(185_50%_15%/0.5)]"
                )}>
                  <span className="text-xs font-bold text-[hsl(var(--cyan))] font-mono">AI</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))] font-[family-name:var(--font-display)]">
                    API Configuration
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Connect to OpenAI for transcription and analysis
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-[hsl(var(--text-subtle))] uppercase tracking-wider">
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--text-ghost))] hover:text-[hsl(var(--text))] transition-colors"
                    >
                      {showApiKey ? (
                        <EyeClosedIcon className="w-4 h-4" />
                      ) : (
                        <EyeOpenIcon className="w-4 h-4" />
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
                        <CheckIcon className="w-4 h-4" />
                        Saved
                      </>
                    ) : (
                      "Save Key"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-[hsl(var(--text-subtle))] flex items-center gap-2">
                  <InfoCircledIcon className="w-3.5 h-3.5" />
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
              <div className="flex items-center gap-4 mb-5">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-[hsl(45_50%_15%/0.5)]"
                )}>
                  <svg className="w-5 h-5 text-[hsl(45_100%_60%)]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.433 22.396l4.83-8.387H22l-4.833 8.387H4.433zm7.192-9.471L6.79 4.167h6.795l4.833 8.758h-6.793zm6.795-8.758L22 4.167l-4.833 8.387-3.58-6.387 4.833-2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))] font-[family-name:var(--font-display)]">
                    Google Drive Integration
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Optional: Import audio files directly from Google Drive
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--text-subtle))] uppercase tracking-wider mb-2">
                    Google Client ID
                  </label>
                  <Input
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="your-client-id.apps.googleusercontent.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--text-subtle))] uppercase tracking-wider mb-2">
                    Google API Key
                  </label>
                  <Input
                    value={googleApiKey}
                    onChange={(e) => setGoogleApiKey(e.target.value)}
                    placeholder="AIza..."
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-[hsl(var(--text-subtle))] flex items-center gap-2">
                    <InfoCircledIcon className="w-3.5 h-3.5" />
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
                        <CheckIcon className="w-4 h-4" />
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

          {/* Default Export Formats */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-[hsl(325_50%_15%/0.5)]"
                )}>
                  <VideoIcon className="w-5 h-5 text-[hsl(var(--magenta))]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))] font-[family-name:var(--font-display)]">
                    Default Export Formats
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Select formats to export by default
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.values(VIDEO_FORMATS).map((format) => {
                  const isSelected = settings.defaultFormats?.includes(format.id);
                  return (
                    <button
                      key={format.id}
                      onClick={() => toggleDefaultFormat(format.id)}
                      className={cn(
                        "p-3 rounded-lg text-left transition-colors",
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
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[hsl(var(--text))]">
                          {format.name}
                        </span>
                        <div
                          className={cn(
                            "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors",
                            isSelected
                              ? "bg-[hsl(var(--cyan))] border-[hsl(var(--cyan))]"
                              : "border-[hsl(var(--glass-border))]"
                          )}
                        >
                          {isSelected && <CheckIcon className="w-2 h-2 text-[hsl(260_30%_6%)]" />}
                        </div>
                      </div>
                      <p className="text-[10px] text-[hsl(var(--text-muted))] font-mono">
                        {format.aspectRatio}
                      </p>
                      <p className="text-[10px] text-[hsl(var(--text-ghost))] mt-0.5 truncate">
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
              <div className="flex items-center gap-4 mb-5">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-[hsl(270_50%_15%/0.5)]"
                )}>
                  <TimerIcon className="w-5 h-5 text-[hsl(var(--violet))]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))] font-[family-name:var(--font-display)]">
                    Clip Settings
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Default settings for new clips
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--text-subtle))] uppercase tracking-wider mb-2">
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
                  <p className="text-xs text-[hsl(var(--text-muted))] mt-2">
                    Recommended: 15-45 seconds for social media
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--text-subtle))] uppercase tracking-wider mb-2">
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
                  <p className="text-xs text-[hsl(var(--text-muted))] mt-2">
                    How often to save your work automatically
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card variant="default">
            <CardContent className="p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-[hsl(158_50%_15%/0.5)]"
                )}>
                  <LayersIcon className="w-5 h-5 text-[hsl(var(--success))]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--text))] font-[family-name:var(--font-display)]">
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
                      "group flex items-center justify-between p-3 rounded-lg transition-colors",
                      "bg-[hsl(var(--surface))]",
                      "border border-[hsl(var(--glass-border))]",
                      "hover:border-[hsl(0_0%_100%/0.12)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg border border-[hsl(var(--glass-border))] shrink-0"
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
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider",
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
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => duplicateTemplate(template.id)}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          "text-[hsl(var(--text-ghost))]",
                          "hover:text-[hsl(var(--text))]",
                          "hover:bg-[hsl(var(--raised))]"
                        )}
                      >
                        <CopyIcon className="w-3.5 h-3.5" />
                      </button>
                      {!template.isBuiltIn && (
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            "text-[hsl(var(--text-ghost))]",
                            "hover:text-[hsl(var(--error))]",
                            "hover:bg-[hsl(var(--error)/0.1)]"
                          )}
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
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
                  <p className="text-sm font-bold text-[hsl(var(--text))] font-[family-name:var(--font-display)]">
                    Podcast Clipper
                  </p>
                  <p className="text-xs text-[hsl(var(--text-muted))] mt-0.5">
                    Version 0.1.0
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[hsl(var(--text-muted))]">
                    Built with Tauri, React & Remotion
                  </p>
                  <p className="text-xs text-[hsl(var(--text-ghost))] mt-0.5">
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
