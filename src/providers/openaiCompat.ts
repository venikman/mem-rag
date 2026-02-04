import { ChatClient, ChatCompletion, ChatMessage, EmbeddingsClient } from "./types.js";

export type OpenAICompatOptions = {
  baseUrl: string;
  apiKey?: string;
  provider: string;
  model: string;
  defaultHeaders?: Record<string, string>;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function createOpenAICompatChatClient(opts: OpenAICompatOptions): ChatClient {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const defaultHeaders = opts.defaultHeaders ?? {};

  return {
    provider: opts.provider,
    model: opts.model,
    async complete(input): Promise<ChatCompletion> {
      const url = `${baseUrl}/chat/completions`;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...defaultHeaders,
        ...(input.extraHeaders ?? {})
      };
      if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;

      const body = {
        model: opts.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens
      };

      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(`Chat completion failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as any;
      const text = (json?.choices?.[0]?.message?.content ?? "").toString();
      const usage = mapUsage(json?.usage);
      return { text, usage, raw: json };
    }
  };
}

export function createOpenAICompatEmbeddingsClient(opts: OpenAICompatOptions): EmbeddingsClient {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const defaultHeaders = opts.defaultHeaders ?? {};

  return {
    provider: opts.provider,
    model: opts.model,
    async embed(input): Promise<Float32Array[]> {
      const url = `${baseUrl}/embeddings`;
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...defaultHeaders,
        ...(input.extraHeaders ?? {})
      };
      if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;

      const body = { model: opts.model, input: input.texts };
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(`Embeddings failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as any;
      const data = Array.isArray(json?.data) ? json.data : [];
      return data.map((d: any) => new Float32Array(d.embedding as number[]));
    }
  };
}

function mapUsage(usage: any) {
  if (!usage || typeof usage !== "object") return undefined;
  return {
    promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    completionTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
    totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined
  };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<failed to read response body>";
  }
}

