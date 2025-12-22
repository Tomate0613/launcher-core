import { promises as fs } from "node:fs";
import crypto from "node:crypto";

export async function ensureDirectoryExists(directoryPath: string) {
  try {
    await fs.access(directoryPath);
  } catch {
    await fs.mkdir(directoryPath, { recursive: true });
  }
}

export async function getHash(filePath: string) {
  const file = await fs.readFile(filePath);
  return crypto.createHash("sha1").update(file).digest("hex");
}

export async function checkFile(
  filePath: string,
  hash: string,
): Promise<boolean> {
  try {
    await fs.access(filePath);
    return (await getHash(filePath)) === hash;
  } catch {
    return false;
  }
}

export function cleanUp<T>(array: T[]): T[] {
  return [...new Set(Object.values(array).filter((value) => value !== null))];
}

export async function parseJson<T>(path: string): Promise<T> {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

export async function tryParseJson<T>(path: string): Promise<T | null> {
  try {
    return await parseJson(path);
  } catch {
    return null;
  }
}

export function applyOverrides<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> | undefined,
) {
  if (overrides === undefined) {
    return;
  }

  for (const key of Object.keys(defaults)) {
    const override = overrides[key];
    const defaultValue = defaults[key];

    if (
      override === undefined ||
      override == null ||
      typeof override !== typeof defaultValue
    ) {
      continue;
    }

    if (typeof defaultValue === "object") {
      applyOverrides(defaultValue as {}, override);
    } else {
      (defaults as Record<string, unknown>)[key] = override;
    }
  }
}

