jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// A realistic phone viewport. Individual layout tests can override this mock.
jest.spyOn(require('react-native'), 'useWindowDimensions').mockImplementation(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 }));
