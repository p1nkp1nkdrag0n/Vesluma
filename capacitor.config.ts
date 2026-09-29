import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vesluma.app',
  appName: 'Vesluma',
  webDir: 'dist',
  backgroundColor: '#edf2ef',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
  },
};

export default config;
