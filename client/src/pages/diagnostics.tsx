import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApiBase, getUploadBase } from "@/lib/queryClient";
import { Capacitor } from "@capacitor/core";
import {
  requestAllAndroidPermissions,
  startBackgroundRecording,
  stopBackgroundRecording,
  recordingStatus,
  setUploadConfig,
  debugTestRecord,
} from "@/lib/native-recorder";

export default function Diagnostics() {
  const [health, setHealth] = useState<string>("not-run");
  const [userRes, setUserRes] = useState<string>("not-run");
  const [wsStatus, setWsStatus] = useState<string>("idle");
  const [micTest, setMicTest] = useState<string>("idle");
  const [nativeStatus, setNativeStatus] = useState<string>("idle");
  const [permStatus, setPermStatus] = useState<string>("idle");
  const [token, setToken] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const platform = Capacitor.getPlatform();
  const [apiBase, setApiBase] = useState<string>(() => {
    try { return localStorage.getItem('apiBase') || getApiBase(); } catch { return getApiBase(); }
  });
  const [uploadBase, setUploadBase] = useState<string>(() => {
    try { return localStorage.getItem('uploadBase') || getUploadBase(); } catch { return getUploadBase(); }
  });
  const deviceId = useMemo(() => {
    try { return localStorage.getItem("deviceId") || null; } catch { return null; }
  }, []);

  useEffect(() => {
    try { setToken(localStorage.getItem("uploadToken")); } catch {}
  }, []);

  const wsUrl = useMemo(() => {
    try {
      const base = getApiBase();
      if (base) {
        const u = new URL(base);
        const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${u.host}/ws`;
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws`;
    } catch {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws`;
    }
  }, []);

  async function pingHealth() {
    try {
      const res = await fetch(`${getApiBase() || ''}/api/health`, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      setHealth(`${res.status} ${res.ok ? 'OK' : 'ERR'} :: ${JSON.stringify(json)}`);
    } catch (e: any) {
      setHealth(`ERR ${e?.message || e}`);
    }
  }

  async function pingUser() {
    try {
      const res = await fetch(`${getApiBase() || ''}/api/user`, { credentials: 'include' });
      const txt = await res.text();
      setUserRes(`${res.status} ${res.ok ? 'OK' : 'ERR'} :: ${txt}`);
    } catch (e: any) {
      setUserRes(`ERR ${e?.message || e}`);
    }
  }

  function connectWs() {
    try {
      setWsStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setWsStatus('open');
      ws.onclose = () => setWsStatus('closed');
      ws.onerror = () => setWsStatus('error');
      ws.onmessage = () => {};
    } catch (e: any) {
      setWsStatus(`ERR ${e?.message || e}`);
    }
  }

  function closeWs() {
    wsRef.current?.close();
    setWsStatus('closed');
  }

  async function testWebMic() {
    setMicTest('testing');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('mediaDevices/getUserMedia not supported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Try quick record if available
      if ((window as any).MediaRecorder) {
        const rec = new MediaRecorder(stream);
        rec.start();
        await new Promise((r) => setTimeout(r, 1000));
        rec.stop();
      }
      stream.getTracks().forEach(t => t.stop());
      setMicTest('ok');
    } catch (e: any) {
      setMicTest(`ERR ${e?.name || ''} ${e?.message || e}`);
    }
  }

  async function requestAndroidPerms() {
    setPermStatus('requesting');
    try {
      const perms = await requestAllAndroidPermissions();
      setPermStatus(`mic=${perms?.mic ? 'granted' : 'denied'} notif=${perms?.notifications ? 'granted' : 'denied'}`);
    } catch (e: any) {
      setPermStatus(`ERR ${e?.message || e}`);
    }
  }

  async function startNative() {
    setNativeStatus('starting');
    try {
      const t = (() => { try { return localStorage.getItem('uploadToken'); } catch { return null; }})();
      if (t) await setUploadConfig((getUploadBase() || getApiBase() || ''), t);
      const res = await startBackgroundRecording();
      setNativeStatus(res.recording ? 'recording' : 'not-recording');
    } catch (e: any) {
      setNativeStatus(`ERR ${e?.message || e}`);
    }
  }

  async function stopNative() {
    try {
      const res = await stopBackgroundRecording();
      setNativeStatus(res.recording ? 'recording' : 'stopped');
    } catch (e: any) {
      setNativeStatus(`ERR ${e?.message || e}`);
    }
  }

  async function nativeDebug3s() {
    try {
      const res = await debugTestRecord();
      setNativeStatus(res.ok ? `debug ok: ${res.filePath || ''}` : 'debug failed');
    } catch (e: any) {
      setNativeStatus(`ERR ${e?.message || e}`);
    }
  }

  async function refreshUploadToken() {
    try {
      const res = await fetch(`${getApiBase() || ''}/api/auth/upload-token`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}`);
      const { token } = await res.json();
      try { localStorage.setItem('uploadToken', token); } catch {}
      setToken(token);
    } catch (e: any) {
      setToken(`ERR ${e?.message || e}`);
    }
  }

  function saveBases() {
    try {
      if (apiBase) localStorage.setItem('apiBase', apiBase); else localStorage.removeItem('apiBase');
      if (uploadBase) localStorage.setItem('uploadBase', uploadBase); else localStorage.removeItem('uploadBase');
      alert('Saved API/Upload base overrides in this browser.');
    } catch {}
  }

  function clearBases() {
    try {
      localStorage.removeItem('apiBase');
      localStorage.removeItem('uploadBase');
      setApiBase('');
      setUploadBase('');
    } catch {}
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-900">Diagnostics</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader><CardTitle>Environment</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Platform: {platform}</div>
            <div className="flex flex-col gap-2">
              <div>Detected API_BASE: {getApiBase() || '(empty)'} </div>
              <div>Detected UPLOAD_BASE: {getUploadBase() || '(empty)'} </div>
              <div className="flex items-center gap-2">
                <span className="w-28">API override</span>
                <input className="border rounded px-2 py-1 w-full" placeholder="https://your-ngrok-url" value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28">Upload override</span>
                <input className="border rounded px-2 py-1 w-full" placeholder="defaults to API" value={uploadBase}
                  onChange={(e) => setUploadBase(e.target.value)} />
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={saveBases}>Save Overrides</Button>
                <Button size="sm" variant="secondary" onClick={clearBases}>Clear Overrides</Button>
              </div>
            </div>
            <div>Location Origin: {typeof window !== 'undefined' ? window.location.origin : ''}</div>
            <div>Device ID: {deviceId || '(none)'}</div>
            <div>Upload Token: {token ? (token.length > 12 ? token.slice(0,12) + '…' : token) : '(none)'} </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={refreshUploadToken}>Refresh Upload Token</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Connectivity</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={pingHealth}>GET /api/health</Button>
              <Button size="sm" onClick={pingUser}>GET /api/user</Button>
              <Button size="sm" onClick={connectWs}>WS connect</Button>
              <Button size="sm" variant="secondary" onClick={closeWs}>WS close</Button>
            </div>
            <div>Health: {health}</div>
            <div>User: {userRes}</div>
            <div>WS: {wsStatus} ({wsUrl})</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Microphone</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={testWebMic}>Web mic test (2s)</Button>
              <Button size="sm" onClick={requestAndroidPerms}>Request Android perms</Button>
            </div>
            <div>Web mic: {micTest}</div>
            <div>Android perms: {permStatus}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Native Recorder</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={startNative}>Start native</Button>
              <Button size="sm" variant="secondary" onClick={stopNative}>Stop native</Button>
              <Button size="sm" onClick={nativeDebug3s}>Debug 3s record</Button>
            </div>
            <div>Status: {nativeStatus}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
