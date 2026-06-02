export function estimateTokens(text: string, type: "code" | "prose" | "mixed" = "mixed"): number {
  const ratio = type === "code" ? 3.5 : type === "prose" ? 4.0 : 3.75;
  return Math.ceil(text.length / ratio);
}

export function timestamp(): string {
  return new Date().toISOString();
}

export function timeShort(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk as Buffer));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    // If no stdin data after 4s, resolve with whatever we have so far.
    // On Windows, stdin delivery from Claude Code hooks can be slow.
    setTimeout(() => resolve(chunks.length ? Buffer.concat(chunks).toString("utf-8") : "{}"), 4000);
  });
}
