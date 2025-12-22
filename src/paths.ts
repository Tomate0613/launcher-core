import path from "node:path";
import { LauncherOptions } from "./types";

export type Paths = ReturnType<typeof getPaths>;

export function getPaths(options: LauncherOptions) {
  const customVersionName = options.version.custom ?? options.version.number;
  const versionsRoot =
    options.paths?.versionRoot ?? path.join(options.root, "versions");

  const customVersionDirectoryPath = path.join(versionsRoot, customVersionName);

  const customVersionPath = path.join(
    customVersionDirectoryPath,
    `${customVersionName}.json`,
  );

  const vanillaVersionDirectoryPath = path.resolve(
    path.join(versionsRoot, options.version.number),
  );
  const vanillaVersionJsonPath = path.join(
    vanillaVersionDirectoryPath,
    `${options.version.number}.json`,
  );
  const vanillaJarPath = path.join(
    vanillaVersionDirectoryPath,
    `${options.version.number}.jar`,
  );

  const librariesPath = path.resolve(
    options.paths?.libraryRoot || path.join(options.root, "libraries"),
  );

  const assetsPath = path.resolve(
    options.paths?.assetRoot || path.join(options.root, "assets"),
  );

  const assetIndexPath = path.join(
    assetsPath,
    "indexes",
    `${options.version.number}.json`,
  );

  const legacyNativesDirectoryPath = path.resolve(
    options.paths?.legacyNativesDirectory ||
      path.join(options.root, "natives", options.version.number),
  );

  return {
    vanillaVersionJsonPath,

    customVersionDirectoryPath,
    customVersionPath,

    librariesPath,
    assetsPath,
    vanillaJarPath,
    assetIndexPath,

    legacyNativesDirectoryPath,
  } as const;
}
