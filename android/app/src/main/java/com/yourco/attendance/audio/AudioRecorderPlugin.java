package com.yourco.attendance.audio;

import android.Manifest;
import android.content.Context;
import android.util.Base64;
import android.provider.Settings;
import android.net.Uri;
import android.content.Intent;
import android.os.Build;
import android.app.AppOpsManager;
import android.content.pm.PackageManager;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import android.media.MediaRecorder;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

@CapacitorPlugin(
        name = "AudioRecorder",
        permissions = {
                @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
                @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
        }
)
public class AudioRecorderPlugin extends Plugin {

    @PluginMethod
    public void setConfig(PluginCall call) {
        try {
            String apiBase = call.getString("apiBase");
            String token = call.getString("token");
            if (apiBase != null) RecordingService.setApiBase(apiBase);
            if (token != null) RecordingService.setBearerToken(token);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Config error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!hasMicPermission()) {
            requestPermissionForAlias("microphone", call, "onPermResult");
            return;
        }
        // On Android 13+, ensure POST_NOTIFICATIONS is granted for foreground service
        if (Build.VERSION.SDK_INT >= 33 && !hasNotificationPermission()) {
            requestPermissionForAlias("notifications", call, "onStartNotifResult");
            return;
        }
        Context ctx = getContext();
        Intent intent = new Intent(ctx, RecordingService.class);
        intent.setAction(RecordingService.ACTION_START);
        ContextCompat.startForegroundService(ctx, intent);
        JSObject ret = new JSObject();
        ret.put("recording", true);
        call.resolve(ret);
    }

    @com.getcapacitor.annotation.PermissionCallback
    @SuppressWarnings("unused")
    private void onStartNotifResult(PluginCall call) {
        if (hasNotificationPermission()) {
            start(call);
        } else {
            call.reject("Notification permission denied");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, RecordingService.class);
        intent.setAction(RecordingService.ACTION_STOP);
        ctx.startService(intent);
        JSObject ret = new JSObject();
        ret.put("recording", false);
        ret.put("filePath", RecordingService.getLastFilePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("recording", RecordingService.getIsRecording());
        ret.put("filePath", RecordingService.getLastFilePath());
        call.resolve(ret);
    }

    @PluginMethod
    public void getLastBase64(PluginCall call) {
        String path = RecordingService.getLastFilePath();
        if (path == null) {
            call.reject("No recording file");
            return;
        }
        File f = new File(path);
        if (!f.exists()) {
            call.reject("File not found");
            return;
        }
        try (FileInputStream fis = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int read = fis.read(buf);
            if (read <= 0) {
                call.reject("Empty file");
                return;
            }
            String b64 = Base64.encodeToString(buf, Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("base64", b64);
            ret.put("filePath", path);
            ret.put("mimeType", "audio/mp4");
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Read error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void rotateAndGetBase64(PluginCall call) {
        String oldPath = RecordingService.rotateAndReturnOldFile(getContext());
        if (oldPath == null) {
            call.reject("Rotate failed or not recording");
            return;
        }
        File f = new File(oldPath);
        if (!f.exists()) {
            call.reject("File not found");
            return;
        }
        try (FileInputStream fis = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int read = fis.read(buf);
            if (read <= 0) {
                call.reject("Empty file");
                return;
            }
            String b64 = Base64.encodeToString(buf, Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("base64", b64);
            ret.put("filePath", oldPath);
            ret.put("mimeType", "audio/mp4");
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Read error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasMicPermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("microphone", call, "onRequestPermResult");
    }

    @com.getcapacitor.annotation.PermissionCallback
    @SuppressWarnings("unused")
    private void onRequestPermResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasMicPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (hasNotificationPermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "onRequestNotifPermResult");
    }

    @com.getcapacitor.annotation.PermissionCallback
    @SuppressWarnings("unused")
    private void onRequestNotifPermResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasNotificationPermission());
        call.resolve(ret);
    }

    // Debug helper: record a 3-second file directly using MediaRecorder
    @PluginMethod
    public void debugTestRecord(PluginCall call) {
        try {
            Context ctx = getContext();
            File outDir = ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_MUSIC);
            if (outDir != null && !outDir.exists()) outDir.mkdirs();
            final File out = new File(outDir, "debug_test_" + System.currentTimeMillis() + ".m4a");

            final MediaRecorder recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(16000);
            recorder.setAudioSamplingRate(16000);
            try { recorder.setAudioChannels(1); } catch (Throwable ignored) {}
            recorder.setOutputFile(out.getAbsolutePath());
            recorder.prepare();
            recorder.start();

            new Thread(() -> {
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ignored) {}
                try {
                    recorder.stop();
                } catch (Exception ignored) {}
                try {
                    recorder.reset();
                    recorder.release();
                } catch (Exception ignored) {}
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("filePath", out.getAbsolutePath());
                call.resolve(ret);
            }).start();
        } catch (Exception e) {
            call.reject("debugTestRecord failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open battery settings: " + e.getMessage());
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    @SuppressWarnings("unused")
    private void onPermResult(PluginCall call) {
        if (hasMicPermission()) {
            start(call);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    private boolean hasMicPermission() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasNotificationPermission() {
        Context ctx = getContext();
        // Before Android 13 (API 33) there is no POST_NOTIFICATIONS runtime permission.
        // Treat notifications as granted if the app is allowed to show notifications.
        if (Build.VERSION.SDK_INT < 33) {
            try {
                return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
            } catch (Throwable t) {
                // On any error, assume enabled to avoid false negatives
                return true;
            }
        }
        // On Android 13+, check the runtime permission first
        int perm = ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS);
        if (perm == PackageManager.PERMISSION_GRANTED) return true;
        // As a fallback, also consider whether notifications are enabled at the app level
        try {
            return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        } catch (Throwable t) {
            return false;
        }
    }
}
