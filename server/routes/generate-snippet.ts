import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { transcripts, clips } from "../db/schema.js";
import { jwtAuthMiddleware } from "../middleware/auth.js";

const router = Router();

interface GenerateRequest {
  projectId: string;
  prompt: string;
  focusClipId?: string;
  anthropicApiKey?: string;
}

router.use(jwtAuthMiddleware);

router.post("/generate-snippet", async (req: Request, res: Response) => {
  const { projectId, prompt, focusClipId, anthropicApiKey } = req.body as GenerateRequest;

  // Use API key from request (settings) or fall back to environment variable
  const apiKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "Anthropic API key not configured. Add it in Settings or set ANTHROPIC_API_KEY environment variable.",
    });
    return;
  }

  if (!projectId || !prompt) {
    res.status(400).json({ error: "projectId and prompt are required" });
    return;
  }

  // Fetch transcript for the project
  const [transcript] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.projectId, projectId))
    .limit(1);

  if (!transcript) {
    res
      .status(400)
      .json({ error: "No transcript found for this episode. Transcribe the episode first." });
    return;
  }

  // Optionally fetch focus clip
  let focusClip = null;
  let focusClipNumber = null;
  if (focusClipId) {
    const [clip] = await db.select().from(clips).where(eq(clips.id, focusClipId));
    if (clip) {
      focusClip = clip;
      // Get clip number (index in list ordered by creation)
      const allClips = await db
        .select()
        .from(clips)
        .where(eq(clips.projectId, projectId))
        .orderBy(clips.createdAt);
      focusClipNumber = allClips.findIndex((c) => c.id === focusClipId) + 1;
    }
  }

  const anthropic = new Anthropic({ apiKey });

  const systemPrompt = `You are an expert social media content creator for podcasts. Create engaging text snippets suitable for social media posts, show notes, or marketing.

Your output must be valid JSON with this exact structure:
{
  "content": "The generated text snippet (the actual social media copy)",
  "name": "Brief descriptive title, max 80 chars (e.g., 'Clip 3: Dating advice for introverts')"
}

Guidelines for content:
- Match the tone requested by the user
- Be engaging and shareable
- Capture key insights from the transcript
- Keep it concise for social media (typically 100-280 characters unless told otherwise)

Guidelines for name:
- Start with "Clip N:" if focused on a specific clip
- Be descriptive of the content and intent
- Max 80 characters`;

  let userPrompt = `## Full Episode Transcript:\n${transcript.text}\n\n`;

  if (focusClip) {
    userPrompt += `## Focus Area - Clip ${focusClipNumber} (prioritize this content):\n`;
    userPrompt += `Timestamp: ${focusClip.startTime.toFixed(1)}s - ${focusClip.endTime.toFixed(1)}s\n`;
    userPrompt += `Transcript: ${focusClip.transcript || "(no transcript)"}\n\n`;
  }

  userPrompt += `## Your Task:\n${prompt}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000,
      },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Extract text content (skip thinking blocks)
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      res.status(500).json({ error: "No text response from AI" });
      return;
    }

    // Parse JSON response - look for JSON object in the text
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("AI response missing JSON:", textBlock.text);
      res.status(500).json({ error: "Invalid response format from AI" });
      return;
    }

    const result = JSON.parse(jsonMatch[0]);

    if (!result.content || !result.name) {
      console.error("AI response missing fields:", result);
      res.status(500).json({ error: "AI response missing required fields" });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("Snippet generation error:", err);
    const message = err instanceof Error ? err.message : "Generation failed";
    res.status(500).json({ error: message });
  }
});

export { router as generateSnippetRouter };
