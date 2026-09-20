import "dotenv/config";
import { CliProvider } from "../src/runner/provider";
for (const provider of ["codex", "gemini"] as const) {
  try {
    const p = new CliProvider(provider);
    console.log(provider, await p.detect());
    console.log(provider, await p.healthCheck());
  } catch (e) {
    console.log(provider, "ERROR", (e as Error).message);
  }
}
