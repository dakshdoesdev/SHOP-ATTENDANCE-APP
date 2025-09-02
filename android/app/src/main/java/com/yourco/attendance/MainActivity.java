package com.yourco.attendance;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.yourco.attendance.audio.AudioRecorderPlugin;
import com.getcapacitor.BridgeWebChromeClient;
import android.webkit.PermissionRequest;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Ensure our in-app plugin is registered so permission prompts work
    registerPlugin(AudioRecorderPlugin.class);

    // Allow WebView getUserMedia (microphone) permission requests
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
          // Grant any media capture requests coming from the app WebView
          runOnUiThread(() -> {
            try {
              request.grant(request.getResources());
            } catch (Throwable ignored) {}
          });
        }
      });
    }
  }
}
