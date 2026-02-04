import fs from "node:fs/promises";
import path from "node:path";

export type DiscoverOptions = {
  root: string;
  includeExts: string[];
};

export async function discoverFiles(opts: DiscoverOptions): Promise<string[]> {
  const out: string[] = [];
  await walk(opts.root, out, new Set(opts.includeExts.map((e) => e.toLowerCase())));
  return out.sort();
}

async function walk(dir: string, out: string[], exts: Set<string>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full, out, exts);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (exts.has(ext)) out.push(full);
  }
}

export function inferIncludeExts(includePatterns: string[] | undefined): string[] {
  if (!includePatterns || includePatterns.length === 0) return [".pdf", ".md", ".markdown"];
  const exts = new Set<string>();
  for (const p of includePatterns) {
    const match = p.toLowerCase().match(/\.([a-z0-9]{1,6})$/);
    if (match) exts.add(`.${match[1]}`);
  }
  return exts.size > 0 ? [...exts] : [".pdf", ".md", ".markdown"];
}

