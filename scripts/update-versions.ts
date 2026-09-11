import fs from "node:fs";
import { ensureDirectoryExists } from "../src/utils.ts";
import type { VersionManifest } from "../src";

async function run() {
  const manifest = (await (
    await fetch(
      "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    )
  ).json()) as VersionManifest;

  const versions = manifest.versions.map((version) => version.id);
  const ids = versions.reverse();

  ensureDirectoryExists("src/data");
  fs.writeFileSync(
    "src/data/versions.ts",
    `export default ${JSON.stringify(ids)} as const;`,
  );
}

run();
