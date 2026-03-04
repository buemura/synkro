import { readFileSync } from "node:fs";
import * as path from "node:path";

import type { Config } from "./types";

const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(new URL(import.meta.url).pathname);

export function loadConfig(): Config {
  const filePath = path.resolve(_dirname, "../mastermind.json");
  const file = readFileSync(filePath, "utf-8");
  return JSON.parse(file) as Config;
}
