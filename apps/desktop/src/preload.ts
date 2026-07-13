// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import {
  OPEN_WORKSPACE_CHANNEL,
  type OpenWorkspaceResult,
  type PineDesktopApi,
} from './shared/projects';

const pineApi: PineDesktopApi = {
  openWorkspace: (): Promise<OpenWorkspaceResult> => ipcRenderer.invoke(OPEN_WORKSPACE_CHANNEL),
};

contextBridge.exposeInMainWorld('pine', pineApi);

declare global {
  interface Window {
    pine: PineDesktopApi;
  }
}
