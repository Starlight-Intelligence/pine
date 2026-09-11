export const CHECK_FOR_UPDATE_CHANNEL = "update:check" as const;
export const DOWNLOAD_UPDATE_CHANNEL = "update:download" as const;
export const INSTALL_UPDATE_CHANNEL = "update:install" as const;
export const UPDATE_EVENT_CHANNEL = "update:event" as const;

export interface PineUpdateInfo {
  changelog: string;
  internalVersion: string;
  publishedAt: string;
  version: string;
}

export type UpdateCheckResult =
  | { status: "available"; update: PineUpdateInfo }
  | { status: "current" | "unconfigured" | "unsupported" };

export interface DownloadUpdateResult {
  ready: boolean;
}

export interface InstallUpdateResult {
  started: boolean;
}

export type PineUpdateEvent =
  | {
      percent: number;
      totalBytes: number;
      transferredBytes: number;
      type: "download-progress";
    }
  | { type: "download-ready" }
  | { message: string; type: "error" };

export type UpdateEventListener = (event: PineUpdateEvent) => void;
