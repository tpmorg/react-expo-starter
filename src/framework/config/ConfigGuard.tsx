import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppServices } from '../appServices';
import type { ConfigIssue } from './runtimeConfig';

export function ConfigGuard({ children, renderConfigError }: React.PropsWithChildren<{
  renderConfigError?: (issues: readonly ConfigIssue[]) => React.ReactNode;
}>) {
  const { configIssues, reporter } = useAppServices();
  const errors = configIssues.filter((issue) => issue.severity === 'error');

  useEffect(() => {
    configIssues.forEach((issue) => {
      reporter.addBreadcrumb('Runtime configuration issue', {
        key: issue.key,
        severity: issue.severity,
        message: issue.message
      });
    });
  }, [configIssues, reporter]);

  if (!errors.length) return children;
  if (renderConfigError) return renderConfigError(errors);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>The app configuration is incomplete.</Text>
      {errors.map((issue) => (
        <Text key={issue.key} style={styles.body}>{issue.message}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFFFFF' },
  title: { color: '#202020', fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' },
  body: { color: '#505050', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 }
});

