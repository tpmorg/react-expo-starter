import { contrastRatio, relativeLuminance } from '../contrast';
test('uses WCAG linearized sRGB luminance and rejects ambiguous colors', () => {
  expect(relativeLuminance('#000000')).toBe(0);
  expect(relativeLuminance('#FFFFFF')).toBe(1);
  expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
  expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  expect(() => relativeLuminance('#fff')).toThrow();
});
