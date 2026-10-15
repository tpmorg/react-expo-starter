import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { BillingProvider } from './billing/BillingProvider';
import { ConfigGuard } from './config/ConfigGuard';
import { AppErrorBoundary } from './errors/AppErrorBoundary';
import { useAppServices } from './appServices';
import { NetworkProvider } from './network/NetworkProvider';

export function FrameworkProviders({ children }: React.PropsWithChildren) {
  const { auth, network, reporter } = useAppServices();
  return <AppErrorBoundary reporter={reporter}>
    <ConfigGuard><DatabaseGate>
      <NetworkProvider monitor={network}><AuthProvider store={auth}>
        <IdentityReporter /><OptionalBilling>{children}</OptionalBilling>
      </AuthProvider></NetworkProvider>
    </DatabaseGate></ConfigGuard>
  </AppErrorBoundary>;
}
function DatabaseGate({children}: React.PropsWithChildren) {
  const {database, reporter} = useAppServices();
  const [status, setStatus] = useState('loading');
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    database.initialize().then(() => {if(active) setStatus('ready');})
      .catch(error => { reporter.captureException(error); if(active) setStatus('error'); });
    return () => {active = false;};
  }, [database, reporter, attempt]);
  if(status === 'ready') return children;
  return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
    {status === 'loading' ? <ActivityIndicator /> : <>
      <Text>Could not open local storage.</Text>
      <Button title="Retry" onPress={() => retry(value => value + 1)} />
    </>}
  </View>;
}
function OptionalBilling({children}: React.PropsWithChildren) {
  const {billingStore} = useAppServices();
  const {state} = useAuth();
  if(!billingStore || state.status !== 'authenticated') return children;
  return <BillingProvider store={billingStore}>{children}</BillingProvider>;
}
function IdentityReporter() {
  const { reporter } = useAppServices();
  const { state } = useAuth();
  useEffect(() => reporter.setUser(state.user), [reporter, state.user]);
  return null;
}
