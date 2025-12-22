import { LauncherOptions } from ".";

export function getOS(options: LauncherOptions) {
  if (options.os) {
    return options.os;
  }

  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "osx";
    default:
      return "linux";
  }
}

export function getJavaTarget() {
  const { arch, platform } = process;

  switch (platform) {
    case "linux": {
      if (arch === "ia32") return "linux-i386";
      return "linux";
    }
    case "darwin": {
      if (arch === "arm64") return "max-os-arm64";
      return "mac-os";
    }

    case "win32": {
      if (arch === "arm64") return "windows-arm64";
      if (arch === "ia32") return "windows-x86";
      return "windows-x64";
    }

    default: {
      throw new Error(`Unsupported platform/arch: ${platform}/${arch}`);
    }
  }
}
