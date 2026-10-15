import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ErrorReporter } from '../contracts';

interface Props extends React.PropsWithChildren {
  reporter: ErrorReporter;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.reporter.captureException(error, { componentStack: info.componentStack ?? '' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>The app hit an unexpected problem.</Text>
        <Text style={styles.body}>Close and reopen the app. Your saved library has not been erased.</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F4F0E8' },
  title: { color: '#211D2B', fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' },
  body: { color: '#6F6878', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 }
});
