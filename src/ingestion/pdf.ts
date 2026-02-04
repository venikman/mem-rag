import { spawn } from "node:child_process";

export async function extractPdfText(pdfPath: string): Promise<string> {
  const args = ["-nopgbrk", "-layout", pdfPath, "-"];
  const { code, stdout, stderr } = await run("pdftotext", args);
  if (code !== 0) {
    throw new Error(`pdftotext failed (code ${code}): ${stderr || stdout}`.trim());
  }
  return stdout;
}

async function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

