import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface StudioFilesPlugin {
  shareImage(options: { base64: string; filename: string; mime: string }): Promise<void>;
  exit(): Promise<void>;
  addListener(event: 'back' | 'pause', listener: () => void): Promise<PluginListenerHandle>;
}

const StudioFiles = registerPlugin<StudioFilesPlugin>('StudioFiles');
let initialized = false;

/** Save through Android's standard chooser; browser builds download the same image. */
export async function shareImage(blob: Blob, filename: string): Promise<void> {
  if (!['image/png', 'image/jpeg'].includes(blob.type)) throw new Error('Choose PNG or JPEG to export.');
  if (Capacitor.isNativePlatform()) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to prepare this image. Please try again.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    await StudioFiles.shareImage({ base64: data, filename, mime: blob.type });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Returning true from onBack consumes the Android back gesture. */
export async function initNative(onBack: () => boolean | Promise<boolean>, onPause: () => void): Promise<void> {
  if (initialized) return;
  initialized = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onPause();
  });
  window.addEventListener('pagehide', onPause);
  if (!Capacitor.isNativePlatform()) return;
  await StudioFiles.addListener('pause', onPause);
  let handlingBack = false;
  await StudioFiles.addListener('back', async () => {
    if (handlingBack) return;
    handlingBack = true;
    try {
      if (!(await onBack())) await StudioFiles.exit();
    } finally {
      handlingBack = false;
    }
  });
}
