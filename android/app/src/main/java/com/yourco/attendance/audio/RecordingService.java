package com.yourco.attendance.audio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.MediaRecorder;
import android.media.AudioManager;
import android.os.Build;
import android.os.Environment;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.yourco.attendance.MainActivity;
import com.yourco.attendance.R;

import java.io.File;
import java.io.IOException;
import java.io.DataOutputStream;
import java.io.FileInputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class RecordingService extends Service {
    public static final String ACTION_START = "com.yourco.attendance.audio.START";
    public static final String ACTION_STOP = "com.yourco.attendance.audio.STOP";
    public static final String EXTRA_FILEPATH = "filepath";
    private static final String CHANNEL_ID = "audio_record_channel";
    private static final int NOTIF_ID = 20251;

    private static volatile boolean isRecording = false;
    private static volatile String lastFilePath = null;
    private static volatile long lastSegmentStart = 0L;
    private static volatile String apiBase = null;
    private static volatile String bearerToken = null;

    private static MediaRecorder mediaRecorder;
    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener focusListener;

    public static boolean getIsRecording() { return isRecording; }
    public static String getLastFilePath() { return lastFilePath; }
    public static void setApiBase(String base) { apiBase = base; }
    public static void setBearerToken(String token) { bearerToken = token; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            startForegroundInternal();
            startRecording();
            // Periodic rotation + upload every 60 seconds (faster feedback)
            new Thread(() -> {
                while (isRecording) {
                    try { Thread.sleep(20 * 1000); } catch (InterruptedException ignored) {}
                    if (!isRecording) break;
                    Log.d("RecordingService", "Rotate tick - attempting segment rotation");
                    String old = rotateAndReturnOldFile(this);
                    if (old != null) {
                        int duration = (int) Math.max(0, (System.currentTimeMillis() - lastSegmentStart) / 1000);
                        uploadFile(old, duration);
                    }
                }
            }).start();
        } else if (ACTION_STOP.equals(action)) {
            stopRecording();
            stopForeground(true);
            stopSelf();
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startForegroundInternal() {
        createNotificationChannel();

        Intent notifIntent = new Intent(this, MainActivity.class);
        notifIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notifIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Recording audio")
                .setContentText("Recording in background")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build();

        startForeground(NOTIF_ID, notification);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Background Audio Recording",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Capturing microphone audio in background");
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(channel);
        }
    }

    private void startRecording() {
        if (isRecording) return;
        requestAudioFocus();
        startNewRecorder(this);
    }

    private void stopRecording() {
        if (!isRecording) return;
        try {
            mediaRecorder.stop();
        } catch (Exception ignored) {}
        try {
            mediaRecorder.reset();
            mediaRecorder.release();
        } catch (Exception ignored) {}
        mediaRecorder = null;
        abandonAudioFocus();
        // Upload the final segment if possible
        try {
            String path = lastFilePath;
            int duration = (int) Math.max(0, (System.currentTimeMillis() - lastSegmentStart) / 1000);
            if (path != null) uploadFile(path, duration);
        } catch (Exception ignored) {}
        isRecording = false;
        Log.i("RecordingService", "Recording stopped. Saved: " + lastFilePath);
    }

    public static synchronized String rotateAndReturnOldFile(Context ctx) {
        if (!isRecording || mediaRecorder == null) return null;
        String oldPath = lastFilePath;
        try {
            try { mediaRecorder.stop(); } catch (Exception ignored) {}
            try { mediaRecorder.reset(); mediaRecorder.release(); } catch (Exception ignored) {}
            mediaRecorder = null;
            // Immediately start a new segment
            startNewRecorder(ctx);
            Log.i("RecordingService", "Segment rotated. Old: " + oldPath + ", New: " + lastFilePath);
            return oldPath;
        } catch (Exception e) {
            Log.e("RecordingService", "Rotate failed", e);
            return null;
        }
    }

    private static void startNewRecorder(Context ctx) {
        try {
            File outDir = ctx.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
            if (outDir != null && !outDir.exists()) outDir.mkdirs();
            String ts = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            File outFile = new File(outDir, "recording_" + ts + ".mp4");
            lastFilePath = outFile.getAbsolutePath();

            mediaRecorder = new MediaRecorder();
            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            // Tune for long sessions: ~16 kbps AAC mono @16kHz
            mediaRecorder.setAudioEncodingBitRate(16000);
            mediaRecorder.setAudioSamplingRate(16000);
            try { mediaRecorder.setAudioChannels(1); } catch (Throwable ignored) {}
            mediaRecorder.setOutputFile(lastFilePath);
            // Optional: set max duration per file (e.g., 10 minutes) – we'll do manual rotation from JS
            // mediaRecorder.setMaxDuration(10 * 60 * 1000);
            mediaRecorder.prepare();
            mediaRecorder.start();
            isRecording = true;
            lastSegmentStart = System.currentTimeMillis();
            Log.i("RecordingService", "Recording started: " + lastFilePath);
        } catch (Exception e) {
            Log.w("RecordingService", "Primary MIC start failed: " + e.getMessage());
            // Fallback to alternate sources for broader device compatibility
            int[] fallbacks = new int[] { MediaRecorder.AudioSource.DEFAULT, MediaRecorder.AudioSource.VOICE_COMMUNICATION };
            boolean started = false;
            Exception lastErr = null;
            for (int src : fallbacks) {
                try {
                    mediaRecorder = new MediaRecorder();
                    mediaRecorder.setAudioSource(src);
                    mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                    mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                    mediaRecorder.setAudioEncodingBitRate(16000);
                    mediaRecorder.setAudioSamplingRate(16000);
                    try { mediaRecorder.setAudioChannels(1); } catch (Throwable ignored) {}
                    mediaRecorder.setOutputFile(lastFilePath);
                    mediaRecorder.prepare();
                    mediaRecorder.start();
                    isRecording = true;
                    lastSegmentStart = System.currentTimeMillis();
                    Log.i("RecordingService", "Recording started (fallback src=" + src + "): " + lastFilePath);
                    started = true;
                    lastErr = null;
                    break;
                } catch (Exception ex) {
                    lastErr = ex;
                    try { mediaRecorder.reset(); mediaRecorder.release(); } catch (Exception ignored2) {}
                    mediaRecorder = null;
                    Log.w("RecordingService", "Fallback start failed (src=" + src + "): " + ex.getMessage());
                }
            }
            if (!started) {
                Log.e("RecordingService", "Failed to start recorder with any source", lastErr);
            }
        }
    }

    private void requestAudioFocus() {
        try {
            if (audioManager == null) audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                if (focusListener == null) {
                    focusListener = focusChange -> Log.d("RecordingService", "Audio focus change: " + focusChange);
                }
                int result = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
                Log.d("RecordingService", "Audio focus request result=" + result);
            }
        } catch (Exception ex) {
            Log.w("RecordingService", "Audio focus request failed: " + ex.getMessage());
        }
    }

    private void abandonAudioFocus() {
        try {
            if (audioManager != null && focusListener != null) {
                audioManager.abandonAudioFocus(focusListener);
            }
        } catch (Exception ignored) {}
    }

    private static void uploadFile(String path, int durationSec) {
        if (apiBase == null || bearerToken == null) {
            Log.w("RecordingService", "No API base/token set; skipping upload");
            return;
        }
        File file = new File(path);
        if (!file.exists()) return;
        HttpURLConnection conn = null;
        try {
            String boundary = "----RECBOUNDARY" + System.currentTimeMillis();
            URL url = new URL(apiBase + "/api/audio/upload");
            conn = (HttpURLConnection) url.openConnection();
            conn.setDoOutput(true);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

            DataOutputStream out = new DataOutputStream(conn.getOutputStream());

            // duration field
            out.writeBytes("--" + boundary + "\r\n");
            out.writeBytes("Content-Disposition: form-data; name=\"duration\"\r\n\r\n" + durationSec + "\r\n");

            // file field
            out.writeBytes("--" + boundary + "\r\n");
            out.writeBytes("Content-Disposition: form-data; name=\"audio\"; filename=\"" + file.getName() + "\"\r\n");
            out.writeBytes("Content-Type: audio/mp4\r\n\r\n");
            FileInputStream fis = new FileInputStream(file);
            byte[] buf = new byte[8192];
            int len;
            while ((len = fis.read(buf)) != -1) {
                out.write(buf, 0, len);
            }
            fis.close();
            out.writeBytes("\r\n--" + boundary + "--\r\n");
            out.flush();
            int code = conn.getResponseCode();
            Log.i("RecordingService", "Upload response code: " + code + " for " + file.getName());
        } catch (Exception e) {
            Log.e("RecordingService", "Upload failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
