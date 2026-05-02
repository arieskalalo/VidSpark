import Groq from "groq-sdk";
import { NextRequest } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a creative video caption writer.
Given a topic or description, return ONLY valid JSON with one field:
- "text": a short, punchy caption (max 12 words) suitable for a video overlay

Return ONLY the JSON object, no markdown, no explanation.`,
      },
      {
        role: "user",
        content: `Generate a video caption for: ${prompt}`,
      },
    ],
    temperature: 0.8,
    max_tokens: 128,
  });

  const raw = response.choices[0].message.content?.trim() ?? "";
  const parsed = JSON.parse(raw) as { text: string };

  return Response.json({ text: parsed.text });
}
