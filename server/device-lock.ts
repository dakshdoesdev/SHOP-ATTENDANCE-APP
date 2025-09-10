import fs from 'fs';
import path from 'path';

const filePath = path.resolve(import.meta.dirname, 'device-lock.json');

type DeviceMap = Record<string, string>;

function readMap(): DeviceMap {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function writeMap(map: DeviceMap) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2), 'utf8');
  } catch {}
}

export function getBoundDeviceId(userId: string): string | undefined {
  const map = readMap();
  return map[userId];
}

export function bindDeviceId(userId: string, deviceId: string) {
  const map = readMap();
  if (map[userId] && map[userId] !== deviceId) return; // do not overwrite different existing binding silently
  map[userId] = deviceId;
  writeMap(map);
}

export function unbindDeviceId(userId: string) {
  const map = readMap();
  if (map[userId]) {
    delete map[userId];
    writeMap(map);
  }
}

