import type { ExpoConfig } from 'expo/config';
const config: ExpoConfig = {
  name: 'Mobile Starter',
  slug: 'mobile-starter',
  scheme: 'mobile-starter',
  version: '0.1.0',
  orientation: 'portrait',
  ios: {bundleIdentifier: 'com.example.mobilestarter', supportsTablet:true},
  android: {package: 'com.example.mobilestarter'},
  plugins: ['expo-sqlite', '@sentry/react-native', 'expo-status-bar'],
  extra: {apiUrl: process.env.EXPO_PUBLIC_API_URL}
};
export default config;
