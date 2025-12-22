import path from "node:path";
import { DownloadManager } from "./downloads";
import { promises as fs } from "node:fs";
import { TaskManager } from "./tasks";

const MAIN_MANIFEST_URL =
  "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

export const legacyJavaVersionUnspecifiedGameVersions = [
  "13w38c",
  "13w38b",
  "13w38a",
  "1.6.4",
  "13w37b",
  "1.6.3",
  "13w37a",
  "13w36b",
  "13w36a",
  "1.6.2",
  "1.6.1",
  "1.6",
  "13w26a",
  "13w25c",
  "13w25b",
  "13w25a",
  "13w24b",
  "13w24a",
];

type Download = { sha1?: string; size?: number; url: string };

type Runtime = {
  availability: { group: number; progress: number };
  manifest: Download;
  version: { name: string; released: string };
};

export type JavaVersionComponent =
  | "java-runtime-alpha"
  | "java-runtime-beta"
  | "java-runtime-delta"
  | "java-runtime-gamma"
  | "java-runtime-gamma-snapshot"
  | "jre-legacy"
  | "minecraft-java-exe";

export type JavaMainManifest = {
  [K in JavaTarget]: {
    [V in JavaVersionComponent]: Runtime[];
  };
};

type JavaFile =
  | { type: "directory" }
  | {
      type: "file";
      executable: boolean;
      downloads: { lzma?: Download; raw?: Download };
    };

export type JavaRuntimeManifest = {
  files: Record<string, JavaFile>;
};

export type JavaTarget =
  | "gamecore"
  | "linux"
  | "linux-i386"
  | "mac-os"
  | "max-os-arm64"
  | "windows-arm64"
  | "windows-x64"
  | "windows-x86";

export async function downloadJava(
  target: JavaTarget,
  api: DownloadManager,
  downloadPath: string,
  versionComponent: JavaVersionComponent,
) {
  const { data: mainManifest } = await api.get<JavaMainManifest>(MAIN_MANIFEST_URL);

  const runtimes = mainManifest[target];
  const [a] = runtimes[versionComponent];

  const { data: runtimeManifest } = await api.get<JavaRuntimeManifest>(
    a.manifest.url,
  );

  const { files } = runtimeManifest;

  await Promise.all(
    Object.keys(files).map(async (key) => {
      const value = files[key];

      if (value.type == "directory") {
        await fs.mkdir(path.join(downloadPath, key), { recursive: true });
      } else if (value.type == "file") {
        const filePath = path.join(downloadPath, key);
        await api.download({
          url: value.downloads.raw!.url,
          outputPath: filePath,
          hash: value.downloads.raw!.sha1,
          type: "java",
        });
        await fs.chmod(filePath, 0o755);
      }
    }),
  );
}

export async function javaTasks(
  target: JavaTarget,
  api: DownloadManager,
  tasks: TaskManager,
  javaDirectory: string,
  versionComponent: JavaVersionComponent,
) {
  const mainManifest = await api.json<JavaMainManifest>({
    url: MAIN_MANIFEST_URL,
    path: path.join(javaDirectory, "manifest.json"),
    type: "java",
  });

  const runtimes = mainManifest[target];
  const [a] = runtimes[versionComponent];

  const downloadPath = path.join(javaDirectory, versionComponent);

  const runtimeManifest = await api.json<JavaRuntimeManifest>({
    url: a.manifest.url,
    path: path.join(downloadPath, "manifest.json"),
    type: "java",
  });

  const { files } = runtimeManifest;

  for (const key of Object.keys(files)) {
    const value = files[key];

    // TODO Take a look at lzma downloads
    if (value.type == "file") {
      const filePath = path.join(downloadPath, key);
      if (value.executable) {
        tasks.fileChmod(
          value.downloads.raw!.url,
          filePath,
          value.downloads.raw!.sha1,
          value.downloads.raw!.size,
          0o755,
          "java",
        );
      } else {
        tasks.file(
          value.downloads.raw!.url,
          filePath,
          value.downloads.raw!.sha1,
          value.downloads.raw!.size,
          "java",
        );
      }
    }
  }
}
