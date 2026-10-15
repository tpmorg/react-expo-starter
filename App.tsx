import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppServicesProvider, useAppServices, type FrameworkOptions } from './src/framework/appServices';
import { FrameworkProviders } from './src/framework/FrameworkProviders';

// Product-specific composition belongs here. Add feature migrations and optional adapters.
const options: FrameworkOptions = {
  databaseName: 'starter.db',
  namespace: '@mobile-starter',
  jobsPath: '/api/v1/jobs'
};
function Home() {
  const {preferences} = useAppServices();
  const [status, setStatus] = useState('Checking preferences…');
  useEffect(() => {
    let active = true;
    preferences.set('lastOpenedAt', Date.now())
      .then(() => {if(active) setStatus('Local storage is ready.');})
      .catch(() => {if(active) setStatus('Preferences could not be saved.');});
    return () => {active = false;};
  }, [preferences]);
  return <SafeAreaView style={styles.screen}>
    <View><Text style={styles.title}>Mobile starter</Text>
      <Text style={styles.body}>{status}</Text>
      <Text style={styles.body}>Add your first feature here.</Text>
    </View>
  </SafeAreaView>;
}
export default function App() {
  return <SafeAreaProvider><AppServicesProvider options={options}>
    <FrameworkProviders><Home /></FrameworkProviders>
  </AppServicesProvider></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  screen: {flex:1, padding:24, justifyContent:'center', backgroundColor:'#f6f6f6'},
  title: {fontSize:28, fontWeight:'700', color:'#202020'},
  body: {fontSize:16, lineHeight:24, marginTop:12, color:'#505050'}
});
