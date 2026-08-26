export const SET_SIDEBAR_VIBRANCY_CHANNEL =
  "window:set-sidebar-vibrancy" as const;

export const TRANSPARENT_WINDOW_BACKGROUND = "#00000000" as const;
export const OPAQUE_WINDOW_BACKGROUND = "#FFFFFFFF" as const;

export type PinePlatform = NodeJS.Platform;

export interface SetSidebarVibrancyRequest {
  enabled: boolean;
}

export interface SetSidebarVibrancyResult {
  applied: boolean;
}

/**
 * Window-level capabilities exposed through the preload bridge. Vibrancy is a
 * macOS-only native effect, so consumers should gate on `platform` before
 * offering the toggle.
 */
export interface PineWindowApi {
  platform: PinePlatform;
  setSidebarVibrancy: (
    request: SetSidebarVibrancyRequest,
  ) => Promise<SetSidebarVibrancyResult>;
}
