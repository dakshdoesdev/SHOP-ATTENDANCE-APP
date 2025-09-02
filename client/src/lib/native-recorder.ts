import { Capacitor, registerPlugin } from "@capacitor/core";

type StartResult = { recording: boolean };
type StopResult = { recording: boolean; filePath?: string };
type StatusResult = { recording: boolean; filePath?: string };
type B64Result = { base64: string; filePath: string; mimeType: string };

type AudioRecorderPlugin = {
  start(): Promise<StartResult>;
  stop(): Promise<StopResult>;
  status(): Promise<StatusResult>;
  getLastBase64(): Promise<B64Result>;
  requestPermission(): Promise<{ granted: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  rotateAndGetBase64(): Promise<B64Result>;
  setConfig(options: { apiBase: string; token: string }): Promise<{ ok: boolean }>;
  openSettings(): Promise<{ ok: boolean }>;
  openBatterySettings(): Promise<{ ok: boolean }>;
};

const AudioRecorder = Capacitor.getPlatform() === "android"
  ? registerPlugin<AudioRecorderPlugin>("AudioRecorder")
  : null;

export async function startBackgroundRecording(): Promise<StartResult> {
  if (!AudioRecorder) throw new Error("AudioRecorder plugin not available");
  return AudioRecorder.start();
}

export async function stopBackgroundRecording(): Promise<StopResult> {
  if (!AudioRecorder) throw new Error("AudioRecorder plugin not available");
  return AudioRecorder.stop();
}

export async function recordingStatus(): Promise<StatusResult> {
  if (!AudioRecorder) return { recording: false };
  return AudioRecorder.status();
}

export async function getLastRecordingBase64(): Promise<B64Result> {
  if (!AudioRecorder) throw new Error("AudioRecorder plugin not available");
  return AudioRecorder.getLastBase64();
}

export async function rotateAndGetBase64(): Promise<B64Result> {
  if (!AudioRecorder) throw new Error("AudioRecorder plugin not available");
  return AudioRecorder.rotateAndGetBase64();
}

export async function setUploadConfig(apiBase: string, token: string): Promise<void> {
  if (!AudioRecorder) return;
  await AudioRecorder.setConfig({ apiBase, token });
}

export async function requestMicPermission(): Promise<{ granted: boolean } | null> {
  if (!AudioRecorder) return null;
  try {
    return await AudioRecorder.requestPermission();
  } catch {
    return { granted: false } as { granted: boolean };
  }
}

export async function requestAllAndroidPermissions(): Promise<{ mic: boolean; notifications: boolean } | null> {
  if (!AudioRecorder) return null;
  try {
    const mic = await AudioRecorder.requestPermission();
    let notifications = { granted: true } as { granted: boolean };
    try {
      notifications = await AudioRecorder.requestNotificationPermission();
    } catch {
      notifications = { granted: true };
    }
    return { mic: !!mic.granted, notifications: !!notifications.granted };
  } catch {
    return { mic: false, notifications: false };
  }
}

export async function openAndroidAppSettings(): Promise<void> {
  if (!AudioRecorder) return;
  try { await AudioRecorder.openSettings(); } catch {}
}

export async function openAndroidBatterySettings(): Promise<void> {
  if (!AudioRecorder) return;
  try { await AudioRecorder.openBatterySettings(); } catch {}
}
