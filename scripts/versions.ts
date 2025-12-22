import { vanilla } from "tomate-loaders";
import fs from "node:fs";
import { ensureDirectoryExists } from "../src/utils";

async function run() {
  const versions = await vanilla.listSupportedGameVersions();
  const ids = versions.map((version) => version.version).reverse();

  ensureDirectoryExists("src/data");
  fs.writeFileSync(
    "src/data/versions.ts",
    `export default ${JSON.stringify(ids)} as const;`,
  );
}

run();
