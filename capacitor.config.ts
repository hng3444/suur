import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hng3444.suur',
  appName: 'Suur',
  webDir: 'mobile-dist',
  loggingBehavior: 'none',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    LocalNotifications: {
      iconColor: '#3f5efb',
    },
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#eef2ff',
  },
};

export default config;
