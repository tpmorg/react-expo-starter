import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ErrorReporter } from '../contracts';

interface Props extends React.PropsWithChildren {
  reporter: ErrorReporter;
  renderCrash?: (error: Error) => React.ReactNode;
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
    if (this.props.renderCrash) return this.props.renderCrash(this.state.error);
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>The app hit an unexpected problem.</Text>
        <Text style={styles.body}>Close and reopen the app to try again.</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFFFFF' },
  title: { color: '#202020', fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' },
  body: { color: '#505050', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 }
});
