import { Router } from "express";
import OpenAI from "openai";

const router = Router();

interface AnalyzeClipsRequest {
  transcript: {
    words: Array<{ text: string; start: number; end: number }>;
  };
  clipCount: number;
  clipDuration: number;
  keywords?: string;
}

router.post("/analyze-clips", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OpenAI API key not configured on server" });
    return;
  }

  const { transcript, clipCount, clipDuration, keywords } = req.body as AnalyzeClipsRequest;

  if (!transcript?.words || !Array.isArray(transcript.words)) {
    res.status(400).json({ error: "Invalid transcript data" });
    return;
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `Analyze this podcast transcript and identify the top ${clipCount} most "clippable" segments of approximately ${clipDuration} seconds each.

For each segment, evaluate:
1. HOOK (1-10): Does it grab attention immediately?
2. CLARITY (1-10): Understandable without prior context?
3. EMOTION (1-10): Evokes feeling (funny, inspiring, surprising)?
4. QUOTABLE (1-10): Would someone want to share this?
5. COMPLETENESS (1-10): Natural start and end points?

${keywords ? `Focus on segments related to these topics/keywords: ${keywords}` : ""}

TRANSCRIPT (with timestamps in seconds):
${transcript.words.map((w) => `[${w.start.toFixed(1)}] ${w.text}`).join(" ")}

Return ONLY valid JSON in this exact format (no other text):
{
  "segments": [
    {
      "start_time": 0.0,
      "end_time": 30.0,
      "text": "the exact transcript text for this segment",
      "scores": {
        "hook": 8,
        "clarity": 9,
        "emotion": 7,
        "quotable": 8,
        "completeness": 9
      },
      "explanation": "Brief explanation of why this segment is clippable"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content:
            "You are an expert at identifying viral, engaging moments in podcast transcripts. You always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "No response from AI" });
      return;
    }

    const analysis = JSON.parse(content);
    res.json(analysis);
  } catch (err) {
    console.error("Clip analysis error:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: message });
  }
});

export { router as analyzeClipsRouter };
