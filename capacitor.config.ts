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
      iconColor: '#f05a24',
    },
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f7d2b7',
  },
};

export default config;
