import React, { useState } from "react";
import { EyeOpenIcon, EyeClosedIcon, CheckIcon, TrashIcon } from "@radix-ui/react-icons";
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Input } from "../ui";
import { useSettingsStore } from "../../stores/settingsStore";
import { VideoFormat, VIDEO_FORMATS } from "../../lib/types";
import { cn } from "../../lib/utils";

export const Settings: React.FC = () => {
  const { settings, updateSettings, setApiKey, templates, deleteTemplate, duplicateTemplate } =
    useSettingsStore();

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(settings.openaiApiKey || "");
  const [isSaved, setIsSaved] = useState(false);

  const handleSaveApiKey = () => {
    setApiKey(apiKeyInput);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const toggleDefaultFormat = (format: VideoFormat) => {
    const current = settings.defaultFormats || [];
    const updated = current.includes(format)
      ? current.filter((f) => f !== format)
      : [...current, format];
    updateSettings({ defaultFormats: updated });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Settings</h2>
        <p className="text-[hsl(var(--muted-foreground))] mt-1">
          Configure your API keys and preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>
              Enter your OpenAI API key to enable transcription and AI analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  OpenAI API Key
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="sk-..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      {showApiKey ? (
                        <EyeClosedIcon className="w-4 h-4" />
                      ) : (
                        <EyeOpenIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <Button onClick={handleSaveApiKey} disabled={!apiKeyInput}>
                    {isSaved ? (
                      <>
                        <CheckIcon className="w-4 h-4 mr-1" />
                        Saved
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1.5">
                  Get your API key from{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--primary))] hover:underline"
                  >
                    platform.openai.com
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Default Formats */}
        <Card>
          <CardHeader>
            <CardTitle>Default Export Formats</CardTitle>
            <CardDescription>
              Select which formats to export by default
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.values(VIDEO_FORMATS).map((format) => (
                <button
                  key={format.id}
                  onClick={() => toggleDefaultFormat(format.id)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    settings.defaultFormats?.includes(format.id)
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10"
                      : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{format.name}</span>
                    {settings.defaultFormats?.includes(format.id) && (
                      <CheckIcon className="w-4 h-4 text-[hsl(var(--primary))]" />
                    )}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {format.aspectRatio}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Clip Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Clip Settings</CardTitle>
            <CardDescription>Default settings for new clips</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Default Clip Duration (seconds)"
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
              <Input
                label="Auto-save Interval (seconds)"
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
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card>
          <CardHeader>
            <CardTitle>Video Templates</CardTitle>
            <CardDescription>
              Manage your video style templates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
                >
                  <div>
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      {template.isBuiltIn ? "Built-in" : "Custom"} •{" "}
                      {template.subtitle.animation} animation
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateTemplate(template.id)}
                    >
                      Duplicate
                    </Button>
                    {!template.isBuiltIn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTemplate(template.id)}
                        className="text-[hsl(var(--destructive))]"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-[hsl(var(--muted-foreground))] space-y-2">
              <p>
                <strong>Podcast Clipper</strong> v0.1.0
              </p>
              <p>
                Create engaging short-form video clips from your podcast episodes.
              </p>
              <p className="pt-2">
                Built with Tauri, React, and OpenAI Whisper.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
