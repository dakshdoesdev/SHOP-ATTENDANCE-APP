import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourco.attendance',
  appName: 'shop-attendance',
  // Vite builds to dist/public per vite.config.ts
  webDir: 'dist/public',
  // Load bundled assets; API base configured in client/.env.production
  server: {
    cleartext: true,
  },
};

export default config;
