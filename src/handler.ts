import { AssetIndex, LauncherOptions, LaunchOptions, Version } from "./types";
import fsSync from "node:fs";
import path from "node:path";
import { Paths } from "./paths";
import { cleanUp } from "./utils";
import { Launcher } from ".";
import { TaskManager } from "./tasks";
import { isAfter, isBefore, isBetween } from "./versions";
import { parseRules } from "./rules";
import { Libraries } from "./libraries";
import { getLaunchOptions } from "./args";
import { getOS } from "./os";

export class Handler {
  libraries: Libraries;

  constructor(
    public launcher: Launcher,
    public taskManager: TaskManager,
    public vanillaVersion: Version,
    public assetIndex: AssetIndex,
    public options: LauncherOptions,
    public paths: Paths,
    public modifyJson: Version | null,
  ) {
    this.libraries = new Libraries(options, taskManager);

    this.taskManager.file(
      vanillaVersion.downloads.client.url,
      paths.vanillaJarPath,
      vanillaVersion.downloads.client.sha1,
      vanillaVersion.downloads.client.size,
      "vanilla-jar",
    );

    this.assetsTasks();
    this.classesTasks();
    this.log4ShellMitigationTasks();

    if (isBefore("1.19", this.vanillaVersion.id)) {
      this.nativesTasks();
    }

    if (this.isLegacy()) {
      this.legacyAssetsTasks();
    }
  }

  nativesTasks() {
    const nativesDirectory = this.paths.legacyNativesDirectoryPath;
    this.vanillaVersion.libraries.map((lib) => {
      if (!lib.downloads || !lib.downloads.classifiers) return;
      if (!parseRules(this.options, lib.rules)) return;

      const native =
        this.getOS() === "osx"
          ? lib.downloads.classifiers["natives-osx"] ||
            lib.downloads.classifiers["natives-macos"]
          : lib.downloads.classifiers[`natives-${this.getOS()}`];

      if (!native) {
        return;
      }

      const name = native.path.split("/").pop()!;
      this.taskManager.fileUnzip(
        native.url,
        path.join(nativesDirectory, name),
        native.sha1,
        native.size,
        "natives",
      );
    });
  }

  assetsTasks() {
    Object.keys(this.assetIndex.objects).map((asset) => {
      const { hash, size } = this.assetIndex.objects[asset];
      const subhash = hash.substring(0, 2);
      const subAsset = path.join(this.paths.assetsPath, "objects", subhash);

      this.taskManager.file(
        `${this.launcher.urls.resource}/${subhash}/${hash}`,
        path.join(subAsset, hash),
        hash,
        size,
        "assets",
      );
    });
  }

  legacyAssetsTasks() {
    // TODO Do not redownload per instance/root, probably symlink?

    const legacyDirectory = path.join(this.options.root, "resources");
    Object.keys(this.assetIndex.objects).map(async (asset) => {
      const { hash, size } = this.assetIndex.objects[asset];
      const subhash = hash.substring(0, 2);

      this.taskManager.file(
        `${this.launcher.urls.resource}/${subhash}/${hash}`,
        path.join(legacyDirectory, asset),
        hash,
        size,
        "assets",
      );

      const legacyAsset = asset.split("/");
      legacyAsset.pop();
    });
  }

  classesTasks() {
    if (this.modifyJson) {
      if (this.modifyJson.mavenFiles) {
        this.libraries.add(
          this.paths.librariesPath,
          this.modifyJson.mavenFiles,
          "classes-maven-custom",
          false,
        );
      }

      this.libraries.add(
        this.paths.librariesPath,
        this.modifyJson.libraries,
        "classes-custom",
        true,
      );
    }

    const parsed = this.vanillaVersion.libraries.filter((lib) => {
      if (
        lib.downloads &&
        lib.downloads.artifact &&
        parseRules(this.options, lib.rules)
      ) {
        if (
          !this.modifyJson ||
          !this.modifyJson.libraries.some(
            (l) => l.name.split(":")[1] === lib.name.split(":")[1],
          )
        ) {
          return true;
        }
      }
      return false;
    });

    this.libraries.add(this.paths.librariesPath, parsed, "classes", true);
  }

  log4ShellMitigationTasks() {
    // Also see where the arguments get applied in jvmArgs

    if (isBefore("1.17", this.vanillaVersion.id)) {
      if (!this.options.log4jConfigurationFile) {
        const configPath = path.resolve(
          /*this.options.overrides.cwd || */ this.options.root,
        );
        if (isAfter("1.12", this.vanillaVersion.id)) {
          this.taskManager.file(
            "https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml",
            path.join(configPath, "log4j2_112-116.xml"),
            "02937d122c86ce73319ef9975b58896fc1b491d1",
            undefined,
            "log4j",
          );
        } else if (isAfter("13w39a", this.vanillaVersion.id)) {
          this.taskManager.file(
            "https://launcher.mojang.com/v1/objects/dd2b723346a8dcd48e7f4d245f6bf09e98db9696/log4j2_17-111.xml",
            path.join(configPath, "log4j2_17-111.xml"),
            "dd2b723346a8dcd48e7f4d245f6bf09e98db9696",
            undefined,
            "log4j",
          );
        }
      }
    }
  }

  private getOS() {
    return getOS(this.options);
  }

  log(msg: string) {
    this.launcher.log(msg);
  }
  warn(msg: string) {
    this.launcher.warn(msg);
  }

  private jvmArgs(launchOptions: LaunchOptions) {
    let nativesDirectory: string;
    if (isAfter("1.19", this.vanillaVersion.id)) {
      nativesDirectory = /*this.options.overrides.cwd ||*/ this.options.root;
    } else {
      nativesDirectory = this.paths.legacyNativesDirectoryPath;
    }

    let jvm = [
      "-XX:-UseAdaptiveSizePolicy",
      "-XX:-OmitStackTraceInFastThrow",
      "-Dfml.ignorePatchDiscrepancies=true",
      "-Dfml.ignoreInvalidMinecraftCertificates=true",
      `-Djava.library.path=${nativesDirectory}`,
      `-Xmx${launchOptions.memory.max}`,
      `-Xms${launchOptions.memory.min}`,
    ];
    const opts = {
      windows:
        "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump",
      osx: "-XstartOnFirstThread",
      linux: "-Xss1M",
    };
    const q = opts[this.getOS()];
    if (this.getOS() === "osx") {
      if (isAfter("1.12", this.vanillaVersion.id)) jvm.push(q);
    } else jvm.push(q);

    if (this.options.customArgs) jvm = jvm.concat(this.options.customArgs);
    if (this.options.log4jConfigurationFile) {
      jvm.push(
        `-Dlog4j.configurationFile=${path.resolve(this.options.log4jConfigurationFile)}`,
      );
    }

    // Log4Shell
    // https://help.minecraft.net/hc/en-us/articles/4416199399693-Security-Vulnerability-in-Minecraft-Java-Edition
    // This is not really needed given a save java version or when using vanilla, but it also can't hurt
    // TODO Find the exact versions instead of using 1.17, 1.12
    if (isBetween("1.17", "1.18.1-rc2", this.vanillaVersion.id)) {
      jvm.push("-Dlog4j2.formatMsgNoLookups=true");
    }
    if (isBefore("1.17", this.vanillaVersion.id)) {
      if (!this.options.log4jConfigurationFile) {
        if (isAfter("1.12", this.vanillaVersion.id)) {
          jvm.push("-Dlog4j.configurationFile=log4j2_112-116.xml");
        } else if (isAfter("13w39a", this.vanillaVersion.id)) {
          jvm.push("-Dlog4j.configurationFile=log4j2_17-111.xml");
        }
      }
    }

    return jvm;
  }

  private classPathsArgs() {
    const classes = cleanUp(this.libraries.libs);
    const classPaths = ["-cp"];
    const separator = path.delimiter;
    this.log(`Using ${separator} to separate class paths`);

    // Handling launch arguments.
    const file = this.modifyJson || this.vanillaVersion;
    // So mods like fabric work.
    const jar = fsSync.existsSync(this.paths.vanillaJarPath)
      ? `${separator}${this.paths.vanillaJarPath}`
      : `${separator}${path.join(this.paths.customVersionDirectoryPath, `${this.options.version.number}.jar`)}`;
    classPaths.push(
      `${this.options.forge ? this.options.forge + separator : ""}${classes.join(separator)}${jar}`,
    );
    classPaths.push(file.mainClass);

    return classPaths;
  }

  isLegacy() {
    return (
      this.vanillaVersion.assets === "legacy" ||
      this.vanillaVersion.assets === "pre-1.6"
    );
  }

  private async launchArgs(launchOptions: LaunchOptions) {
    const opts = await getLaunchOptions(
      this.vanillaVersion,
      this.modifyJson,
      this.paths.assetsPath,
      launchOptions,
      this.options,
      this.isLegacy(),
    );

    this.log("Set launch options");

    return opts;
  }

  async args(launchOptions: LaunchOptions) {
    if (!this.taskManager.isDone) {
      await this.taskManager.execute();
    }

    const args: string[] = [];

    return args.concat(
      this.jvmArgs(launchOptions),
      this.classPathsArgs(),
      await this.launchArgs(launchOptions),
    );
  }
}
