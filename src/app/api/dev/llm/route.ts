// Temporary smoke test for src/lib/llm.ts — delete once real features use it.
import { z } from "zod";
import { generateJSON, generateText } from "@/lib/llm";

export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const text = await generateText("Say hi in 5 words.");
  const json = await generateJSON(
    "Invent a music 'vibe' for someone who listens to lo-fi and jazz.",
    z.object({ vibe: z.string(), emoji: z.string(), summary: z.string() }),
  );
  return Response.json({ text, json });
}
