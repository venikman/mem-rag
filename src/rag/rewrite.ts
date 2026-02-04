import type { ChatClient } from "../providers/types.js";

export async function maybeRewriteQuery(
  chat: ChatClient,
  input: { question: string; enabled: boolean }
): Promise<{ query: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
  if (!input.enabled) return { query: input.question };
  const res = await chat.complete({
    messages: [
      {
        role: "system",
        content: "Rewrite user questions into concise search queries. Output only the query text."
      },
      { role: "user", content: input.question }
    ],
    temperature: 0.0,
    maxTokens: 80
  });
  const q = res.text.trim();
  return { query: q.length > 0 ? q : input.question, usage: res.usage };
}
