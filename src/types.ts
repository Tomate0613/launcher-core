import { DownloadManager } from "./downloads";
import { JavaVersionComponent } from "./java";

export type ProgressEventName =
  | "other"
  | "manifest"
  | "assets"
  | "assets-copy"
  | "natives"
  | "vanilla-jar"
  | "classes"
  | "log4j"
  | "classes-maven-custom"
  | "classes-custom"
  | "java";

type ProgressPayload = {
  current: number;
  total: number;
};

export type Rule = {
  action: "allow" | "disallow";
  features?: Record<string, boolean>;
  os?: { name: OS; version?: string };
};
export type VersionArgument =
  | string
  | { rules: Rule[]; value: string | string[] };

export type Artifact = {
  path: string;
  sha1: string;
  size: number;
  url: string;
};

export type Library = {
  downloads: {
    artifact: Artifact;
    classifiers?: Record<string, Artifact>;
  };
  name: string;
  rules?: Rule[];
  url?: string;
  sha1?: string;
  serverreq?: unknown;
  clientreq?: unknown;
};

export type Version = {
  minecraftArguments?: string;
  mavenFiles?: Library[];
  arguments: {
    game: VersionArgument[];
    jvm: VersionArgument[];
  };
  assetIndex: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  assets: string;
  complianceLevel: number;
  downloads: {
    client: {
      sha1: string;
      size: number;
      url: string;
    };
    client_mappings: {
      sha1: string;
      size: 10989738;
      url: string;
    };
    server: {
      sha1: string;
      size: 57555044;
      url: string;
    };
    server_mappings: {
      sha1: string;
      size: 8186232;
      url: string;
    };
  };
  id: string;
  javaVersion: JavaVersion;
  libraries: Library[];
  logging: {
    client: {
      argument: string;
      file: {
        id: string;
        sha1: string;
        size: number;
        url: string;
      };
      type: string;
    };
  };
  mainClass: string;
  minimumLauncherVersion: number;
  releaseTime: string;
  time: string;
  type: string;

  inheritsFrom?: string;
  forgeWrapperVersion?: string;
};

export type JavaVersion = {
  component: JavaVersionComponent;
  majorVersion: number;
};

export type Events = {
  debug: [string];
  warn: [string];

  data: [string];
  "data-error": [string];

  progress: [ProgressPayload];
  close: [number | null];
};

type OS = "windows" | "osx" | "linux";

export type LauncherOptions = {
  /**
   * Path where you want the launcher to work in.
   * This will usually be your .minecraft folder
   */
  root: string;

  /**
   * OS override for minecraft natives
   *
   * @default will autodetect
   */
  os?: OS;

  /**
   * minecraft version info
   */
  version: {
    /**
     * Actual version.
     *
     * @example '1.16.4'
     */
    number: string;
    /**
     * type of release, usually `release` or `snapshot`
     */
    type: "release" | "snapshot" | string;
    /**
     *   The name of the folder, jar file, and version json in the version folder.
     *
     * ` MCLC will look in the `versions` folder for this name
     * @example '1.16.4-fabric'
     */
    custom?: string;
  };

  /**
   * Path to Forge Jar.
   *
   * Versions below 1.13 should be the "universal" jar while versions above 1.13+ should be the "installer" jar
   */
  forge?: string;

  proxy?: {
    /**
     * Host url to the proxy, don't include the port.
     */
    host: string;
    /**
     *  Username for the proxy.
     *
     * @default 8080
     */
    port?: string;
    /**
     * Username for the proxy.
     */
    username?: string;
    /**
     * Password for the proxy.
     */
    password?: string;
  };
  /**
   * Timeout on download requests.
   */
  timeout?: number;
  /**
   * Path of json cache.
   */
  cache?: string;

  log4jConfigurationFile?: string;

  /**
   * Folder, where the game process generates folders like saves and resource packs.
   */
  gameDirectory?: string;

  /**
   * Array of custom Java arguments
   */
  customArgs?: string[];

  /**
   * Array of game argument feature flags
   */
  features?: Array<string>;

  /**
   * Skips hash checks for libraries and assets. This means they won't get redownloaded if the version json changes.
   * However it is still ensured that the hash is correct on the first download.
   * Half downloaded files should not be an issue either, since they have a different name while downloading
   */
  skipHashChecks?: boolean;

  paths?: {
    /**
     * Versions root. Defaults to `${options.root}/versions`
     */
    versionRoot?: string;
    /**
     * Libraries root. Defaults to `${options.root}/libraries`
     */
    libraryRoot?: string;
    /**
     * Assets root. Defaults to `${options.root}/assets`
     */
    assetRoot?: string;

    legacyNativesDirectory?: string;
  };

  downloadManager?: DownloadManager;

  /**
   * Urls to the Minecraft and Forge resource servers
   *
   * This is for launcher developers located in countries that have the Minecraft and Forge resource servers
   * blocked for what ever reason. They obviously need to mirror the formatting of the original JSONs / file structures.
   */
  urls?: {
    /**
     * Minecraft resources.
     */
    resource?: string;
    /**
     * Forge resources.
     */
    mavenForge?: string;
    /**
     * for Forge only, you need to redefine the library url in the version json.
     */
    defaultRepoForge?: string;
    /**
     *
     */
    fallbackMaven?: string;
  };

  /**
   * Version of the ForgeWrapper which MCLC uses. This allows us to launch modern Forge.
   */
  fw?: {
    baseUrl?: string;
    version?: string;
    sh1?: string;
    size?: number;
  };
};

export type LaunchOptions = {
  /**
   * Path to the JRE executable file, will default to "java" or automatically downloaded java (via `javaTasks`) if not entered.
   */
  javaPath?: string;
  /**
   * Array of custom Minecraft arguments.
   */
  customLaunchArgs?: string[];

  memory: {
    /**
     * Min amount of memory being used by Minecraft.
     */
    max: string;
    /**
     * Max amount of memory being used by Minecraft.
     */
    min: string;
  };
  window?: {
    /**
     * Width of the Minecraft Client
     */
    width?: number;
    /**
     * Height of the Minecraft Client
     */
    height?: number;
    /**
     * Fullscreen the Minecraft Client.
     */
    fullscreen?: boolean;
  };

  /**
   * Allows the game to be launched directly into a world or server
   */
  quickPlay?: {
    /**
     * The type of world you want to join.
     * Note, that versions prior to 1.20 only support "multiplayer". Other types will be ignored
     */
    type: "singleplayer" | "multiplayer" | "realms";
    /**
     * Represents the world you want to join
     *
     * For singleplayer this should be the folder name of the world
     * For multiplayer this should be the IP address of the server
     * For realms this should be the Realms ID
     * legacy follows multiplayer format
     */
    identifier: string;
    /**
     * The specified path for logging (relative to the run directory)
     */
    path?: string;
  };

  authorization: Promise<Authorization> | Authorization;

  /**
   * Whether or not the client is detached from the parent / launcher.
   */
  detached?: boolean;
};

type Authorization = {
  access_token: string;
  client_token?: string;
  uuid: string;
  name?: string;
  user_properties?: Partial<any>;
  meta?: {
    type: "mojang" | "msa" | "legacy";
    xuid?: string;
    demo?: boolean;
    clientId?: string;
  };
};

export type AssetIndex = {
  objects: Record<string, { hash: string; size: number }>;
};
