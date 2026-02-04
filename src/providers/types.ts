export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ChatCompletion = {
  text: string;
  usage?: Usage;
  raw: unknown;
};

export type ChatClient = {
  provider: string;
  model: string;
  complete(input: {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    extraHeaders?: Record<string, string>;
  }): Promise<ChatCompletion>;
};

export type EmbeddingsClient = {
  provider: string;
  model: string;
  embed(input: { texts: string[]; extraHeaders?: Record<string, string> }): Promise<Float32Array[]>;
};

