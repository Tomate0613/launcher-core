import path from "node:path";
import { promises as fs } from "node:fs";
import {
  Version,
  LauncherOptions,
} from "./types";
import { Launcher } from ".";
import { DownloadManager } from "./downloads";
import { Paths } from "./paths";
import Zip from "adm-zip";
import { cleanUp, ensureDirectoryExists, tryParseJson } from "./utils";
import { isAfter } from "./versions";

export class ForgeHandler {
  constructor(
    private launcher: Launcher,
    public api: DownloadManager,
    private options: LauncherOptions,
    private paths: Paths,
  ) {}

  private log(message: string) {
    this.launcher.log(message);
  }

  private isModernForge(json: Version) {
    return (
      json.inheritsFrom &&
      isAfter("1.12", json.inheritsFrom) &&
      !(
        json.inheritsFrom === "1.12.2" &&
        json.id.split(".")[json.id.split(".").length - 1] === "2847"
      )
    );
  }

  private fwAddArgs(mcPath: string) {
    const forgeWrapperAgrs = [
      `-Dforgewrapper.librariesDir=${this.paths.librariesPath}`,
      `-Dforgewrapper.installer=${this.options.forge}`,
      `-Dforgewrapper.minecraft=${mcPath}`,
    ];
    this.options.customArgs
      ? (this.options.customArgs =
          this.options.customArgs.concat(forgeWrapperAgrs))
      : (this.options.customArgs = forgeWrapperAgrs);
  }

  async getForgedWrapped(version: Version, mcPath: string, versionPath: string) {
    let installerJson = null;
    // Since we're building a proper "custom" JSON that will work nativly with MCLC, the version JSON will not
    // be re-generated on the next run.

    let json = await tryParseJson<Version>(versionPath);
    if (json) {
      if (
        !json.forgeWrapperVersion ||
        !(json.forgeWrapperVersion === this.launcher.fw.version)
      ) {
        this.log(
          "Old ForgeWrapper has generated this version JSON, re-generating",
        );
      } else {
        // If forge is modern, add ForgeWrappers launch arguments and set forge to undefined so MCLC treats it as a custom json.
        if (this.isModernForge(json)) {
          this.fwAddArgs(mcPath);
          this.options.forge = undefined;
        }
        return json;
      }
    }

    this.log("Generating Forge version json, this might take a bit");
    const zipFile = new Zip(this.options.forge);
    const text = zipFile.readAsText("version.json");
    if (zipFile.getEntry("install_profile.json")) {
      installerJson = zipFile.readAsText("install_profile.json");
    }

    const newJson: Version = JSON.parse(text);
    if (installerJson) installerJson = JSON.parse(installerJson);
    // Adding the installer libraries as mavenFiles so MCLC downloads them but doesn't add them to the class paths.
    if (installerJson) {
      newJson!.mavenFiles
        ? (newJson!.mavenFiles = newJson!.mavenFiles.concat(
            installerJson.libraries,
          ))
        : (newJson!.mavenFiles = installerJson.libraries);
    }

    // Holder for the specifc jar ending which depends on the specifc forge version.
    let jarEnding = "universal";
    // We need to handle modern forge differently than legacy.
    if (this.isModernForge(newJson!)) {
      // If forge is modern and above 1.12.2, we add ForgeWrapper to the libraries so MCLC includes it in the classpaths.
      if (newJson!.inheritsFrom !== "1.12.2") {
        this.fwAddArgs(mcPath);
        const fwName = `ForgeWrapper-${this.launcher.fw.version}.jar`;
        const fwPathArr = [
          "io",
          "github",
          "zekerzhayard",
          "ForgeWrapper",
          this.launcher.fw.version,
        ];
        newJson!.libraries.push({
          name: fwPathArr.join(":"),
          downloads: {
            artifact: {
              path: [...fwPathArr, fwName].join("/"),
              url: `${this.launcher.fw.baseUrl}${this.launcher.fw.version}/${fwName}`,
              sha1: this.launcher.fw.sh1,
              size: this.launcher.fw.size,
            },
          },
        });
        newJson.mainClass =
          "io.github.zekerzhayard.forgewrapper.installer.Main";
        jarEnding = "launcher";

        // Providing a download URL to the universal jar mavenFile so it can be downloaded properly.
        for (const library of newJson.mavenFiles!) {
          const lib = library.name.split(":");
          if (lib[0] === "net.minecraftforge" && lib[1].includes("forge")) {
            library.downloads.artifact.url =
              this.launcher.urls.mavenForge + library.downloads.artifact.path;
            break;
          }
        }
      } else {
        // Remove the forge dependent since we're going to overwrite the first entry anyways.
        for (const library of Object.keys(newJson.mavenFiles!)) {
          const lib = newJson.mavenFiles![library as never].name.split(":");
          if (lib[0] === "net.minecraftforge" && lib[1].includes("forge")) {
            delete newJson.mavenFiles![library as never];
            break;
          }
        }
      }
    } else {
      // Modifying legacy library format to play nice with MCLC's downloadToDirectory function.
      await Promise.all(
        newJson.libraries.map(async (library) => {
          const lib = library.name.split(":");
          if (lib[0] === "net.minecraftforge" && lib[1].includes("forge"))
            return;

          let url = this.launcher.urls.mavenForge;
          const name = `${lib[1]}-${lib[2]}.jar`;

          if (!library.url) {
            if (library.serverreq || library.clientreq) {
              url = this.launcher.urls.defaultRepoForge;
            } else {
              return;
            }
          }
          library.url = url;
          const downloadLink = `${url}${lib[0].replace(/\./g, "/")}/${lib[1]}/${lib[2]}/${name}`;
          // Checking if the file still exists on Forge's server, if not, replace it with the fallback.
          // Not checking for sucess, only if it 404s.
          const res = await this.api.get(downloadLink);

          if (res.status === 404) {
            library.url = this.launcher.urls.fallbackMaven;
          }
        }),
      );
    }
    // If a downloads property exists, we modify the inital forge entry to include ${jarEnding} so ForgeWrapper can work properly.
    // If it doesn't, we simply remove it since we're already providing the universal jar.
    if (newJson.libraries[0].downloads) {
      const name = newJson.libraries[0].name;
      if (
        name.includes("minecraftforge:forge") &&
        !name.includes("universal")
      ) {
        newJson.libraries[0].name = name + `:${jarEnding}`;
        newJson.libraries[0].downloads.artifact.path =
          newJson.libraries[0].downloads.artifact.path.replace(
            ".jar",
            `-${jarEnding}.jar`,
          );
        newJson.libraries[0].downloads.artifact.url =
          this.launcher.urls.mavenForge + newJson.libraries[0].downloads.artifact.path;
      }
    } else {
      delete newJson.libraries[0];
    }

    // Removing duplicates and null types
    newJson.libraries = cleanUp(newJson.libraries);
    if (newJson.mavenFiles) newJson.mavenFiles = cleanUp(newJson.mavenFiles);

    newJson.forgeWrapperVersion = this.launcher.fw.version;

    // Saving file for next run!
    await ensureDirectoryExists(
      path.join(this.options.root, "forge", version.id),
    );
    await fs.writeFile(versionPath, JSON.stringify(newJson));

    // Make MCLC treat modern forge as a custom version json rather then legacy forge.
    if (this.isModernForge(newJson)) this.options.forge = undefined;

    return newJson;
  }
}
