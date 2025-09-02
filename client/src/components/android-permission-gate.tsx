import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { requestAllAndroidPermissions, openAndroidAppSettings, openAndroidBatterySettings } from "@/lib/native-recorder";
import { Button } from "@/components/ui/button";
import { Mic, Bell, ShieldAlert, Loader2 } from "lucide-react";

type Props = {
  onGranted: () => void;
};

export default function AndroidPermissionGate({ onGranted }: Props) {
  const [checking, setChecking] = useState(true);
  const [micGranted, setMicGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (Capacitor.getPlatform() !== "android") {
      onGranted();
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const perms = await requestAllAndroidPermissions();
      const mg = !!perms?.mic;
      const ng = perms?.notifications !== false; // treat undefined as granted for older Android
      setMicGranted(mg);
      setNotifGranted(ng);
      if (mg && ng) onGranted();
    } catch (e: any) {
      setError(e?.message || "Permission request failed");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { check(); }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border p-6">
        <div className="flex items-center mb-4">
          <ShieldAlert className="h-6 w-6 text-orange-600 mr-2" />
          <h2 className="text-lg font-semibold">Enable Required Permissions</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          To record attendance audio in the background, the app needs access to:
        </p>
        <div className="space-y-3 mb-4">
          <div className="flex items-center">
            <Mic className={`h-5 w-5 mr-2 ${micGranted ? 'text-green-600' : 'text-gray-500'}`} />
            <span className={`text-sm ${micGranted ? 'text-green-700' : 'text-gray-800'}`}>Microphone</span>
            <span className={`ml-auto text-xs ${micGranted ? 'text-green-600' : 'text-red-600'}`}>{micGranted ? 'Granted' : 'Missing'}</span>
          </div>
          <div className="flex items-center">
            <Bell className={`h-5 w-5 mr-2 ${notifGranted ? 'text-green-600' : 'text-gray-500'}`} />
            <span className={`text-sm ${notifGranted ? 'text-green-700' : 'text-gray-800'}`}>Notifications (required for foreground recording)</span>
            <span className={`ml-auto text-xs ${notifGranted ? 'text-green-600' : 'text-red-600'}`}>{notifGranted ? 'Granted' : 'Missing'}</span>
          </div>
        </div>
        {error && (
          <div className="text-sm text-red-600 mb-3">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={check} disabled={checking}>
            {checking ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking...</>) : 'Enable Permissions'}
          </Button>
          <Button className="w-full bg-gray-200 text-gray-900 hover:bg-gray-300" onClick={() => openAndroidAppSettings()}>
            Open Settings
          </Button>
        </div>
        <div className="mt-2">
          <Button variant="ghost" className="text-blue-700" onClick={() => openAndroidBatterySettings()}>
            Open Battery Optimization Settings
          </Button>
        </div>
        <div className="mt-3 text-right">
          {(micGranted && notifGranted) && (
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={onGranted}>Continue</Button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          If the prompt doesn't appear, enable Microphone and Notifications in Android Settings &gt; Apps &gt; shop-attendance &gt; Permissions.
        </p>
      </div>
    </div>
  );
}

