import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.recline.social',
  appName: 'Recline',
  webDir: 'dist',
  server: {
    url: 'https://app.recline.social',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
  android: {
    // Hardware acceleration is required for WebRTC video rendering in the WebView.
    // Also declared in AndroidManifest.xml — belt-and-suspenders.
    // allowMixedContent must remain false; all Recline traffic is HTTPS.
    allowMixedContent: false,
    // Capture keyboard input correctly in the WebView (prevents missed keystrokes
    // when typing in chat while a call is active).
    captureInput: true,
    // Keep the WebView from going dark when the app backgrounds briefly — prevents
    // the call dropping mid-negotiation on Android power-save modes.
    backgroundColor: '#0f1117',
  },
};

export default config;
