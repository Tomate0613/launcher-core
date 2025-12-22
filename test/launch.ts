import fs from "node:fs";
import { loader, LoaderId } from "tomate-loaders";
import { Launcher } from "../src/index";
import { v3 as uuidV3 } from "uuid";
import { MultiProgressBars } from "multi-progress-bars";
import { DownloadManager } from "../src/downloads";
import paths from "node:path";

async function runLoader(
  loaderId: LoaderId,
  gameVersion: string,
  loaderVersion?: string,
) {
  const rootPath = `test-run/${loaderId}-${loaderVersion}-${gameVersion}`;
  fs.mkdirSync(rootPath, { recursive: true });

  const name = "Tomate0613";
  const uuid = uuidV3(name, uuidV3.DNS);

  const mainRoot = paths.join("test-run", "minecraft");

  const launcher = new Launcher({
    ...(await loader(loaderId).getMCLCLaunchConfig({
      rootPath: mainRoot,
      gameVersion,
      loaderVersion,
    })),
    root: rootPath,
    downloadManager,
    paths: {
      assetRoot: paths.join(mainRoot, "assets"),
      libraryRoot: paths.join(mainRoot, "libraries"),
      versionRoot: paths.join(mainRoot, "versions"),
    },
  });

  launcher.on("debug", (msg) => console.log(`[${loaderId}/debug] ${msg}`));
  launcher.on("data", (msg) => console.log(`[${loaderId}/data] ${msg}`));
  launcher.on("close", (code) => console.log(`[${loaderId}/close] ${code}`));

  await launcher.javaTasks("./test-java/");
  await launcher.prepare();

  console.log("Launching in 10 seconds");

  setTimeout(async () => {
    await launcher.launch({
      memory: {
        min: "5G",
        max: "6G",
      },
      authorization: {
        name,
        uuid,
        access_token: uuid,
        client_token: uuid,
        user_properties: {},
      },
    });
  }, 10000);
}

const bar = new MultiProgressBars({
  anchor: "top",
  border: true,
  persist: true,
});

const downloadManager = new DownloadManager();

function setBar(id: string, percentage: number) {
  if (!bar.getIndex(id)) {
    bar.addTask(id, {
      type: "percentage",
      percentage,
    });
  } else {
    bar.updateTask(id, { percentage });
  }
}

downloadManager.on("download-status", (downloadPayload) => {
  const id = `${downloadPayload.type}:${downloadPayload.path}`;
  setBar(id, downloadPayload.progress);

  if (downloadPayload.current == downloadPayload.total) {
    bar.done(id);
  }
});

runLoader(process.argv[3] as never, process.argv[4], process.argv[5]).then(
  () => {
    bar.close();
  },
);
