import { Capacitor } from "@capacitor/core";
import { Geolocation as CapGeolocation } from "@capacitor/geolocation";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export async function getCurrentPosition(): Promise<LocationData> {
  const isNative = Capacitor.isNativePlatform();
  if (isNative) {
    try {
      const perm = await CapGeolocation.checkPermissions();
      if (perm.location !== "granted") {
        const req = await CapGeolocation.requestPermissions();
        if (req.location !== "granted") {
          throw new Error("Location permission denied");
        }
      }
      const pos = await CapGeolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 0,
      };
    } catch (err) {
      // Fall back to browser API on error
    }
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }
    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Location access denied by user"));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location information is unavailable"));
            break;
          case error.TIMEOUT:
            reject(new Error("Location request timed out"));
            break;
          default:
            reject(new Error("An unknown error occurred"));
            break;
        }
      },
      options,
    );
  });
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const SHOP_LOCATION = {
  latitude: 29.379186,
  longitude: 76.991095,
} as const;

export const MAX_DISTANCE = 15000; // meters - increased for testing

