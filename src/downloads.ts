import path from "node:path";
import { IncomingMessage } from "node:http";
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import EventEmitter from "node:events";
import { ProgressEventName } from "./types";
import {
  checkFile,
  ensureDirectoryExists,
  parseJson,
  tryParseJson,
} from "./utils";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import fsSync, { createWriteStream, WriteStream } from "node:fs";
import fs from "node:fs/promises";

type DownloadOptions = {
  url: string;
  outputPath: string;
  type: ProgressEventName;
  hash?: string;
  assumeSkip?: boolean;
};

type JsonOptions = {
  path: string;
  url: string | (() => Promise<string>) | (() => string);
  type: ProgressEventName;
  hash?: string;
};

export type DownloadStatusPayload = {
  name: string;
  path: string;
  url: string;
  type: string;
  current: number;
  total: number;
  progress: number;
};

export type StartDownloadPayload = {
  name: string;
  path: string;
  url: string;
  type: string;
  total: number;
};

export type EndDownloadPayload = {
  name: string;
  path: string;
  url: string;
  type: string;
  reason: "success" | "error";
};

type DownloadEvents = {
  debug: [string];
  "start-download": [StartDownloadPayload];
  "download-status": [DownloadStatusPayload];
  "end-download": [EndDownloadPayload];
};

async function normalizePath(p: string) {
  const absPath = path.resolve(p);
  const dir = path.dirname(absPath);

  await ensureDirectoryExists(dir);

  const realDir = await fs.realpath(dir);
  return path.join(realDir, path.basename(absPath));
}

export class DownloadManager extends EventEmitter<DownloadEvents> {
  private activeDownloads: Map<string, Promise<void>> = new Map();
  private axiosInstance: AxiosInstance;

  constructor(axiosInstance?: AxiosInstance) {
    super();

    const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: 5 });
    const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 5 });
    this.axiosInstance =
      axiosInstance || axios.create({ httpAgent, httpsAgent });
  }

  public get<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: AxiosRequestConfig<D>,
  ): Promise<R> {
    return this.axiosInstance.get(url, config);
  }

  private log(message: string) {
    this.emit("debug", message);
  }

  public async json<T>({ path, url, type, hash }: JsonOptions): Promise<T> {
    if (!hash) {
      let version = await tryParseJson<T>(path);
      if (version) {
        return version;
      }
    }

    await this.download({
      url: typeof url === "function" ? await url() : url,
      hash,
      outputPath: path,
      type,
    });

    return await parseJson<T>(path);
  }

  public async download({
    url,
    outputPath,
    type,
    hash,
    assumeSkip,
  }: DownloadOptions): Promise<void> {
    const normalizedPath = await normalizePath(outputPath);

    // Ensure same file isn't downloaded twice
    if (this.activeDownloads.has(normalizedPath)) {
      this.log(`Download already in progress for: ${normalizedPath}`);
      return this.activeDownloads.get(normalizedPath)!;
    }

    const downloadPromise = this.downloadFile(
      url,
      normalizedPath,
      type,
      assumeSkip ?? false,
      hash,
    );
    this.activeDownloads.set(normalizedPath, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      this.activeDownloads.delete(outputPath);
    }
  }

  private async downloadFile(
    url: string,
    outputPath: string,
    type: ProgressEventName,
    assumeSkip: boolean = false,
    hash?: string,
  ) {
    const dir = path.dirname(outputPath);
    await ensureDirectoryExists(dir);

    if (fsSync.existsSync(outputPath)) {
      if (assumeSkip || (hash && (await checkFile(outputPath, hash)))) {
        this.log(`Skipping download for ${outputPath}`);
        return;
      } else {
        this.log(`Deleted existing file: ${outputPath}`);
        fsSync.rmSync(outputPath, { force: true });
      }
    }

    const tempPath = `${outputPath}.temp`;
    let downloadedBytes = 0;
    let totalBytes = 0;
    let previousReportedProgress = 0;

    if (fsSync.existsSync(tempPath)) {
      downloadedBytes = (await fs.stat(tempPath)).size;
    }

    const headers: any = {};
    if (downloadedBytes > 0) {
      headers.Range = `bytes=${downloadedBytes}-`;
    }

    let response: any;
    let writeStream: WriteStream | null = null;

    try {
      this.log(`Starting download: ${url}`);

      this.emit("start-download", {
        name: path.basename(outputPath),
        path: outputPath,
        url,
        type,
        total: totalBytes,
      });

      response = await this.axiosInstance.get<IncomingMessage>(url, {
        responseType: "stream",
        headers,
      });

      const contentRange = response.headers["content-range"];
      if (contentRange) {
        totalBytes = parseInt(contentRange.split("/")[1]);
      } else {
        totalBytes =
          Number(response.headers["content-length"]) + downloadedBytes;
      }

      writeStream = createWriteStream(tempPath, {
        flags: downloadedBytes > 0 ? "a" : "w",
      });

      response.data.pipe(writeStream);

      if (totalBytes) {
        response.data.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const progress = downloadedBytes / totalBytes;

          if (progress - previousReportedProgress < 0.1) {
            return;
          }

          previousReportedProgress = progress;
          this.emit("download-status", {
            name: path.basename(outputPath),
            path: outputPath,
            url,
            type,
            current: downloadedBytes,
            total: totalBytes,
            progress: Math.max(Math.min(progress, 1), 0),
          });
        });
      }

      await new Promise<void>((resolve, reject) => {
        writeStream!.on("finish", resolve);
        writeStream!.on("error", reject);
        response.data.on("error", reject);
      });

      this.emit("end-download", {
        name: path.basename(outputPath),
        path: outputPath,
        url,
        type,
        reason: "success",
      });

      if (hash && !(await checkFile(tempPath, hash))) {
        throw new Error("File hash mismatch");
      }

      await fs.rename(tempPath, outputPath);
    } catch (error) {
      this.log(`Error downloading ${url} to ${outputPath}: ${error}`);

      this.emit("end-download", {
        name: path.basename(outputPath),
        path: outputPath,
        url,
        type,
        reason: "error",
      });

      if (fsSync.existsSync(tempPath)) {
        try {
          fsSync.unlinkSync(tempPath);
          this.log(`Deleted partial file: ${tempPath}`);
        } catch (unlinkErr) {
          this.log(`Failed to delete temp file: ${unlinkErr}`);
        }
      }

      throw error;
    } finally {
      if (writeStream) {
        writeStream.close();
      }
      if (response?.data?.destroy) {
        response.data.destroy();
      }
    }
  }
}
