import "dotenv/config";

export type AppConfig = {
  dbPath: string;
  runsDir: string;
  pricingPath: string;
  openrouter: {
    baseUrl: string;
    apiKey: string;
    chatModel: string;
    judgeModel: string;
    referer?: string;
    title?: string;
  };
  lmstudio: {
    baseUrl: string;
    apiKey?: string;
    embedModel: string;
    chatModel: string;
  };
  support: {
    provider: "lmstudio" | "openrouter";
    model: string;
  };
};

export function getConfig(): AppConfig {
  const openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
  const openrouterBaseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const chatModel = process.env.CHAT_MODEL ?? "grok-4.1-fast";
  const judgeModel = process.env.JUDGE_MODEL ?? chatModel;

  const lmstudioBaseUrl = process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
  const lmstudioApiKey = process.env.LMSTUDIO_API_KEY || undefined;
  const embedModel = process.env.EMBED_MODEL ?? "text-embedding-3-small";
  const lmstudioChatModel = process.env.LMSTUDIO_CHAT_MODEL ?? "qwen/qwen3-coder-next";

  const dbPath = process.env.MEM_RAG_DB_PATH ?? ".data/mem-rag.sqlite";
  const pricingPath = process.env.PRICING_PATH ?? "pricing.json";
  const supportProvider = (process.env.SUPPORT_PROVIDER ?? "lmstudio") as "lmstudio" | "openrouter";
  const supportModel =
    process.env.SUPPORT_MODEL ??
    (supportProvider === "lmstudio" ? lmstudioChatModel : chatModel);

  return {
    dbPath,
    runsDir: "runs",
    pricingPath,
    openrouter: {
      baseUrl: openrouterBaseUrl,
      apiKey: openrouterApiKey,
      chatModel,
      judgeModel,
      referer: process.env.OPENROUTER_REFERRER || undefined,
      title: process.env.OPENROUTER_TITLE || "mem-rag"
    },
    lmstudio: {
      baseUrl: lmstudioBaseUrl,
      apiKey: lmstudioApiKey,
      embedModel,
      chatModel: lmstudioChatModel
    },
    support: {
      provider: supportProvider,
      model: supportModel
    }
  };
}
