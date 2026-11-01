import type { ExpoConfig } from 'expo/config';
const googleIosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryOrg = process.env.SENTRY_ORG;
const config: ExpoConfig = {
  name: 'Mobile Starter',
  slug: 'mobile-starter',
  scheme: 'mobile-starter',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
  ios: {
    bundleIdentifier: 'com.example.mobilestarter', supportsTablet: true,
    usesAppleSignIn: process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN === 'true',
    infoPlist: {
      'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']
    },
    ...(process.env.IOS_USES_NON_EXEMPT_ENCRYPTION !== undefined ? {
      config: { usesNonExemptEncryption: process.env.IOS_USES_NON_EXEMPT_ENCRYPTION === 'true' }
    } : {})
  },
  android: {package: 'com.example.mobilestarter'},
  plugins: [
    'expo-sqlite', 'expo-status-bar', 'expo-system-ui', 'expo-font', 'expo-splash-screen',
    ...(sentryOrg && sentryProject ? [['@sentry/react-native/expo', { organization: sentryOrg, project: sentryProject }] as [string, Record<string, string>]] : []),
    ...(googleIosId ? [['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosId.split('.').reverse().join('.') }] as [string, Record<string, string>]] : []),
    ...(process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN === 'true' ? ['expo-apple-authentication'] : []),
    ...(process.env.EXPO_PUBLIC_ENABLE_NOTIFICATIONS === 'true' ? ['expo-notifications'] : [])
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    appEnvironment: process.env.EAS_BUILD_PROFILE || 'production',
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    revenueCatEntitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID,
    revenueCatCreditCode: process.env.EXPO_PUBLIC_REVENUECAT_CREDIT_CODE,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: googleIosId,
    firebaseConfig: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    },
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {})
  }
};
export default config;
