import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zahid.fescobills',
  appName: 'FESCO Bills Manager',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
