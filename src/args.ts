import { LauncherOptions, LaunchOptions, Version, VersionArgument } from ".";
import { parseRules } from "./rules";
import { isBefore } from "./versions";

function formatQuickPlay(
  quickPlay: Exclude<LaunchOptions["quickPlay"], undefined>,
  version: Version,
) {
  const { type, identifier, path } = quickPlay;

  // Legacy quickplay (Only supports servers)
  if (isBefore("23w14a", version.id)) {
    if (type !== "multiplayer") {
      return [];
    }

    return [
      "--server",
      identifier.split(":")[0],
      "--port",
      identifier.split(":")[1] || "25565",
    ];
  }

  // Modern quickplay
  const types = {
    singleplayer: "--quickPlaySingleplayer",
    multiplayer: "--quickPlayMultiplayer",
    realms: "--quickPlayRealms",
  };

  const returnArgs = [types[type], identifier];
  if (path) returnArgs.push("--quickPlayPath", path);
  return returnArgs;
}

export async function getLaunchOptions(
  version: Version,
  modifyJson: Version | null,
  assetPath: string,
  launchOptions: LaunchOptions,
  options: LauncherOptions,
  isLegacy: boolean,
): Promise<string[]> {
  const type = Object.assign({}, version, modifyJson);

  let args = type.minecraftArguments
    ? type.minecraftArguments.split(" ")
    : type.arguments.game;

  // This is a bit of a hack. I am sure there is a better way to do this
  const minArgs = /*this.options.overrides.minArgs ||*/ isLegacy ? 5 : 11;
  if (args.length < minArgs)
    args = args.concat(
      version.minecraftArguments
        ? version.minecraftArguments.split(" ")
        : version.arguments.game,
    );
  if (launchOptions.customLaunchArgs)
    args = args.concat(launchOptions.customLaunchArgs);

  launchOptions.authorization = await Promise.resolve(
    launchOptions.authorization,
  );
  launchOptions.authorization.meta = launchOptions.authorization.meta
    ? launchOptions.authorization.meta
    : { type: "mojang" };
  const fields = {
    "${auth_access_token}": launchOptions.authorization.access_token,
    "${auth_session}": launchOptions.authorization.access_token,
    "${auth_player_name}": launchOptions.authorization.name,
    "${auth_uuid}": launchOptions.authorization.uuid,
    "${auth_xuid}":
      launchOptions.authorization.meta.xuid ||
      launchOptions.authorization.access_token,
    "${user_properties}": launchOptions.authorization.user_properties,
    "${user_type}": launchOptions.authorization.meta.type,
    "${version_name}":
      options.version.number /*|| this.options.overrides.versionName*/,
    "${assets_index_name}":
      /*this.options.overrides.assetIndex ||*/ options.version.number,
    "${game_directory}": options.gameDirectory || options.root,
    "${assets_root}": assetPath,
    "${game_assets}": assetPath,
    "${version_type}": options.version.type,
    "${clientid}":
      launchOptions.authorization.meta.clientId ||
      launchOptions.authorization.client_token ||
      launchOptions.authorization.access_token,
    "${resolution_width}": launchOptions.window
      ? launchOptions.window.width
      : 856,
    "${resolution_height}": launchOptions.window
      ? launchOptions.window.height
      : 482,
  };

  if (launchOptions.authorization.meta.demo) {
    args.push("--demo");
  }

  const replaceArg = (obj: Exclude<VersionArgument, string>, index: number) => {
    if (Array.isArray(obj.value)) {
      for (const arg of obj.value) {
        args.push(arg);
      }
    } else {
      args.push(obj.value);
    }
    delete args[index];
  };

  for (let index = 0; index < args.length; index++) {
    if (typeof args[index] === "object") {
      const arg = args[index] as Exclude<VersionArgument, string>;
      if (!arg.rules || parseRules(options, arg.rules)) {
        replaceArg(arg, index);
      }
    } else {
      const arg = args[index] as keyof typeof fields;
      if (Object.keys(fields).includes(arg)) {
        args[index] = fields[arg] as string;
      }
    }
  }
  if (launchOptions.window) {
    if (launchOptions.window.fullscreen) {
      args.push("--fullscreen");
    } else {
      if (launchOptions.window.width)
        args.push("--width", launchOptions.window.width.toString());
      if (launchOptions.window.height)
        args.push("--height", launchOptions.window.height.toString());
    }
  }
  if (launchOptions.quickPlay)
    args = args.concat(formatQuickPlay(launchOptions.quickPlay, version));
  if (options.proxy) {
    args.push(
      "--proxyHost",
      options.proxy.host,
      "--proxyPort",
      options.proxy.port || "8080",
      "--proxyUser",
      options.proxy.username ?? "undefined",
      "--proxyPass",
      options.proxy.password ?? "undefined",
    );
  }
  args = args.filter(
    (value) => typeof value === "string" || typeof value === "number",
  );

  return args as string[];
}

