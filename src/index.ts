import path from "node:path";
import { applyOverrides, ensureDirectoryExists, parseJson } from "./utils";
import child, { ChildProcess } from "node:child_process";
import {
  AssetIndex,
  Events,
  JavaVersion,
  LauncherOptions,
  LaunchOptions,
  Version as Version,
} from "./types";
import { ForgeHandler } from "./forge";
import { DownloadManager } from "./downloads";
import { getPaths, Paths } from "./paths";
import { Handler } from "./handler";
import { vanilla } from "tomate-loaders";
import {
  JavaTarget,
  javaTasks,
  legacyJavaVersionUnspecifiedGameVersions,
} from "./java";
import { TaskManager } from "./tasks";
import { getJavaTarget } from "./os";
import EventEmitter from "node:events";

export class Launcher extends EventEmitter<Events> {
  private tasks: TaskManager;

  private paths: Paths;
  private javaPath = "java";

  private api: DownloadManager;

  private handler?: Handler;

  urls = {
    resource: "https://resources.download.minecraft.net",
    mavenForge: "https://files.minecraftforge.net/maven/",
    defaultRepoForge: "https://libraries.minecraft.net/",
    fallbackMaven: "https://search.maven.org/remotecontent?filepath=",
  };

  fw = {
    baseUrl: "https://github.com/ZekerZhayard/ForgeWrapper/releases/download/",
    version: "1.6.0",
    sh1: "035a51fe6439792a61507630d89382f621da0f1f",
    size: 28679,
  };

  constructor(public options: LauncherOptions) {
    super();

    this.options.root = path.resolve(this.options.root);
    this.paths = getPaths(options);
    this.api = this.options.downloadManager ?? new DownloadManager();
    this.tasks = new TaskManager(this.api, this);

    applyOverrides(this.urls, options.urls);
    applyOverrides(this.fw, options.fw);
  }

  private vanillaVersion() {
    return this.api.json<Version>({
      url: async () =>
        (await vanilla.getVersion(this.options.version.number)).url,
      path: this.paths.vanillaVersionJsonPath,
      type: "manifest",
    });
  }

  private assetIndex(version: Version) {
    return this.api.json<AssetIndex>({
      url: version.assetIndex.url,
      path: this.paths.assetIndexPath,
      hash: version.assetIndex.sha1,
      type: "assets",
    });
  }

  private modifyJson(version: Version) {
    if (this.options.forge) {
      const forgeHandler = new ForgeHandler(
        this,
        this.api,
        this.options,
        this.paths,
      );

      this.options.forge = path.resolve(this.options.forge);
      this.log("Detected Forge in options, getting dependencies");

      return forgeHandler.getForgedWrapped(
        version,
        this.paths.vanillaJarPath,
        this.paths.customVersionPath,
      );
    }

    if (!this.options.version.custom) {
      return null;
    }

    return parseJson<Version>(path.join(this.paths.customVersionPath));
  }

  private async getHandler() {
    if (!this.handler) {
      const vanillaVersion = await this.vanillaVersion();
      const assetIndex = await this.assetIndex(vanillaVersion);
      const modifyJson = await this.modifyJson(vanillaVersion);

      await ensureDirectoryExists(this.options.root);
      this.options.gameDirectory &&
        (await ensureDirectoryExists(this.options.gameDirectory));

      this.handler = new Handler(
        this,
        this.tasks,
        vanillaVersion,
        assetIndex,
        this.options,
        this.paths,
        modifyJson,
      );
    }

    return this.handler;
  }

  private spawnProcess(opts: LaunchOptions, launchArguments: string[]) {
    const minecraft = child.spawn(
      opts.javaPath ?? this.javaPath,
      launchArguments,
      {
        cwd: /*this.options.overrides.cwd || */ this.options.root,
        detached: opts.detached ?? true,
      },
    );
    minecraft.stdout.on("data", (data) =>
      this.emit("data", data.toString("utf-8")),
    );
    minecraft.stderr.on("data", (data) =>
      this.emit("data-error", data.toString("utf-8")),
    );
    minecraft.on("close", (code) => this.emit("close", code));
    return minecraft;
  }

  /**
   * Prepares the game for launch.
   * Will download all necessary files for launch, but not launch the game itself
   */
  public async prepare() {
    return (await this.getHandler()).taskManager.execute();
  }

  /**
   * Launches the game
   * Will execute necessary tasks if `prepare` hasn't been called
   * @returns {Promise<ChildProcess>} the game child process
   */
  public async launch(launchOptions: LaunchOptions): Promise<ChildProcess> {
    this.log("Launching");

    const args = await (await this.getHandler()).args(launchOptions);
    return this.spawnProcess(launchOptions, args);
  }

  /**
   * @returns {Promise<JavaVersion>} The java version required for launching
   */
  public async getJavaVersion(): Promise<JavaVersion> {
    const javaVersion = (await this.vanillaVersion()).javaVersion;

    if (javaVersion) {
      return javaVersion;
    }

    const hasOverride = legacyJavaVersionUnspecifiedGameVersions.includes(
      (await this.vanillaVersion()).id,
    );

    if (!hasOverride) {
      throw new Error("Version manifest does not specify java version");
    }

    return { component: "jre-legacy", majorVersion: 8 };
  }

  /**
   * Download java as part of the prepare/launch process
   * Will automatically set java path for launching unless overwritten in `LaunchOptions`
   */
  public async javaTasks(javaDirectory: string, javaTarget?: JavaTarget) {
    const target = javaTarget ?? getJavaTarget();
    const javaVersion = await this.getJavaVersion();

    await javaTasks(
      target,
      this.api,
      this.tasks,
      javaDirectory,
      javaVersion.component,
    );

    const installationPath = path.join(javaDirectory, javaVersion.component);
    this.javaPath = path.resolve(
      path.join(
        installationPath,
        "bin",
        process.platform == "win32" ? "javaw.exe" : "java",
      ),
    );
  }

  log(message: string) {
    this.emit("debug", message);
  }

  warn(message: string) {
    this.emit("warn", message);
  }
}

export * from "./types";
export * from "./downloads";
export { Task, TasksError } from "./tasks";
export {
  isAfter as isMinecraftVersionAfter,
  isBefore as isMinecraftVersionBefore,
  isBetween as isMinecraftVersionBetween,
} from "./versions";
