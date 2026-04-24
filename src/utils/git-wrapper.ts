import { execFileSync, ExecFileSyncOptions } from "node:child_process";

export function execGit(args: string[], options: ExecFileSyncOptions & { encoding: "utf-8" }): string {
  return execFileSync("git", args, options).toString().trim();
}
