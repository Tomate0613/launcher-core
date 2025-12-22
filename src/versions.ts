import versions from "./data/versions";

type VersionName = (typeof versions)[number];

function idx(version: string) {
  return versions.indexOf(version as never);
}

function staticIdx(version: VersionName) {
  return versions.indexOf(version);
}

/**
 * @returns {boolean} true, if `version` is between `from` and `to` (both including)
 */
export function isBetween(
  from: VersionName,
  to: VersionName,
  version: string,
): boolean {
  const fromIndex = staticIdx(from);
  const toIndex = staticIdx(to);

  if (fromIndex == -1 || toIndex == -1) {
    throw new Error("from or to version is not in list");
  }

  const versionIndex = idx(version);

  return versionIndex >= fromIndex && versionIndex <= toIndex;
}

/**
 * @returns {boolean} true, if `version >= comparisonVersion`
 */
export function isAfter(
  comparisonVersion: VersionName,
  version: string,
): boolean {
  const comparisonIndex = staticIdx(comparisonVersion);
  const versionIndex = idx(version);

  // We don't know this version. Assume its after
  if (versionIndex < 0) {
    return true;
  }

  return versionIndex >= comparisonIndex;
}

/**
 * @returns {boolean} true, if `version < comparisonVersion`
 */
export function isBefore(
  comparisonVersion: VersionName,
  version: string,
): boolean {
  return !isAfter(comparisonVersion, version)
}
