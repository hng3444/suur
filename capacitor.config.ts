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
      iconColor: '#ff6a00',
    },
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f5f7',
  },
};

export default config;
