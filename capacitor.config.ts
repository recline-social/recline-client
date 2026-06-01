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
};

export default config;
