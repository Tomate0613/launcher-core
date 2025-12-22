import path from "node:path";
import { LauncherOptions, Library, ProgressEventName } from ".";
import { parseRules } from "./rules";
import { TaskManager } from "./tasks";

export class Libraries {
  libs: string[] = [];

  constructor(
    private options: LauncherOptions,
    private taskManager: TaskManager,
  ) {}

  public add(
    directory: string,
    libraries: Library[],
    ctx: ProgressEventName,
    addToLibs: boolean,
  ) {
    for (const library of libraries) {
      if (!library) continue;
      if (!parseRules(this.options, library.rules)) continue;

      this.library(directory, library, ctx, addToLibs);
    }
  }

  private library(
    directory: string,
    library: Library,
    ctx: ProgressEventName,
    addToLibs: boolean,
  ) {
    const lib = library.name.split(":");

    let filename: string;
    let jarPath: string;
    if (
      library.downloads &&
      library.downloads.artifact &&
      library.downloads.artifact.path
    ) {
      filename =
        library.downloads.artifact.path.split("/")[
          library.downloads.artifact.path.split("/").length - 1
        ];
      jarPath = path.join(
        directory,
        library.downloads.artifact.path.split("/").slice(0, -1).join("/"),
      );
    } else {
      filename = `${lib[1]}-${lib[2]}${lib[3] ? "-" + lib[3] : ""}.jar`;
      jarPath = path.join(
        directory,
        `${lib[0].replace(/\./g, "/")}/${lib[1]}/${lib[2]}`,
      );
    }

    if (library.url) {
      const url = `${library.url}${lib[0].replace(/\./g, "/")}/${lib[1]}/${lib[2]}/${filename}`;
      this.taskManager.file(
        url,
        path.join(jarPath, filename),
        library.sha1,
        undefined,
        ctx,
      );
    } else if (
      library.downloads &&
      library.downloads.artifact &&
      library.downloads.artifact.url
    ) {
      // Only download if there's a URL provided. If not, we're assuming it's going a generated dependency.
      this.taskManager.file(
        library.downloads.artifact.url,
        path.join(jarPath, filename),
        library.downloads.artifact.sha1,
        library.downloads.artifact.size,
        ctx,
      );
    }

    if (addToLibs) {
      this.libs.push(`${jarPath}${path.sep}${filename}`);
    }
  }
}
