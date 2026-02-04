import fs from "node:fs/promises";

export async function extractMarkdownText(filePath: string): Promise<string> {
  return await fs.readFile(filePath, "utf8");
}

