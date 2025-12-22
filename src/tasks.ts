import { Launcher } from ".";
import { DownloadManager } from "./downloads";
import { ProgressEventName } from "./types";
import Zip from "adm-zip";
import path from "node:path";
import { type Mode, promises as fs } from "node:fs";

export type Task = FileTask | FileUnzipTask | FileChmodTask;

type FileTask = {
  type: "file";

  url: string;
  hash?: string;
  size: number;

  target: string;

  ctx: ProgressEventName;
};

type FileUnzipTask = Omit<FileTask, "type"> & { type: "file-unzip" };
type FileChmodTask = Omit<FileTask, "type"> & {
  type: "file-chmod";
  mode: Mode;
};

export class TasksError extends Error {
  constructor(public failedTasks: { task: Task; error: unknown }[]) {
    super(`Some tasks failed to execute`);
  }
}

export class TaskManager {
  private tasks: Task[] = [];

  constructor(
    public downloadManager: DownloadManager,
    private launcher: Launcher,
  ) {}

  public file(
    url: string,
    target: string,
    hash: string | undefined,
    size: number | undefined,
    ctx: ProgressEventName,
  ) {
    if (!hash) {
      this.warn(`Downloading ${url} without hash`);
    }
    this.tasks.push({
      type: "file",
      url,
      target,
      hash,
      size: size ?? 1,
      ctx,
    });
  }

  public fileUnzip(
    url: string,
    target: string,
    hash: string | undefined,
    size: number | undefined,
    ctx: ProgressEventName,
  ) {
    this.tasks.push({
      type: "file-unzip",
      url,
      target,
      hash,
      size: size ?? 1,
      ctx,
    });
  }

  public fileChmod(
    url: string,
    target: string,
    hash: string | undefined,
    size: number | undefined,
    mode: Mode,
    ctx: ProgressEventName,
  ) {
    this.tasks.push({
      type: "file-chmod",
      url,
      target,
      hash,
      size: size ?? 1,
      mode,
      ctx,
    });
  }

  public async execute() {
    let counter = 0;
    const total = this.tasks.reduce((p, t) => p + t.size, 0);
    const failedTasks = (
      await Promise.all(
        this.tasks.map(async (task) => {
          try {
            await this.executeTask(task);
            counter += task.size;
            this.progress(total, counter);
          } catch (error) {
            return { task, error };
          }
        }),
      )
    ).filter((a) => !!a);

    this.tasks = failedTasks.map((task) => task.task);

    if (failedTasks.length) {
      throw new TasksError(failedTasks);
    }
  }

  public get isDone() {
    return this.tasks.length === 0;
  }

  private async executeTask(task: Task) {
    if (task.type == "file") {
      return this.downloadManager.download({
        url: task.url,
        type: task.ctx,
        outputPath: task.target,
        hash: task.hash ?? undefined,
        assumeSkip: this.launcher.options.skipHashChecks || !task.hash,
      });
    }
    if (task.type == "file-unzip") {
      const launcherInfo = path.join(
        path.dirname(task.target),
        ".launcher-info",
      );

      try {
        // If the .launcher-info exists we can assume the native got unzipped
        await fs.access(launcherInfo);
      } catch {
        await this.downloadManager.download({
          url: task.url,
          type: task.ctx,
          outputPath: task.target,
          hash: task.hash ?? undefined,
          assumeSkip: this.launcher.options.skipHashChecks || !task.hash,
        });

        try {
          new Zip(task.target).extractAllTo(path.dirname(task.target), true);
        } catch (e) {
          // Only doing a warn since a stupid error happens. You can basically ignore this.
          // if it says Invalid file name, just means two files were downloaded and both were deleted.
          // All is well.
          // TODO
          e && this.warn(e?.toString());
        }

        await fs.writeFile(launcherInfo, "");
      }

      return;
    }
    if (task.type == "file-chmod") {
      await this.downloadManager.download({
        url: task.url,
        type: task.ctx,
        outputPath: task.target,
        hash: task.hash ?? undefined,
        assumeSkip: this.launcher.options.skipHashChecks || !task.hash,
      });

      await fs.chmod(task.target, task.mode);
      return;
    }
  }

  private log(msg: string) {
    this.launcher.warn(msg);
  }
  private warn(msg: string) {
    this.launcher.warn(msg);
  }

  private progress(total: number, current: number) {
    this.launcher.emit("progress", {
      total,
      current,
    });
  }
}
