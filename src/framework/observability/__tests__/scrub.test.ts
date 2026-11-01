import { scrub, scrubDeep } from '../scrub';
test('scrubs bearer tokens, signed URLs, JWTs, emails, and long blobs', () => {
  const input = 'Bearer abc.def.ghi person@example.com https://a.test/x?X-Goog-Signature=private&ok=1 eyJabcdefghi.abcdefgh.sig ' + 'A'.repeat(250);
  const result = scrub(input);
  for (const secret of ['abc.def.ghi', 'person@example.com', '=private', 'eyJabcdefghi', 'A'.repeat(250)]) expect(result).not.toContain(secret);
  expect(result).toContain('&ok=1');
});
test('redacts entire sensitive objects, cycles, errors and deeply nested data without mutating input', () => {
  const input: Record<string, unknown> = { token: { nested: 'private' }, error: new Error('Bearer private'), list: ['a@example.com'] };
  input.loop = input;
  const result = scrubDeep(input);
  expect(result.token).toBe('[redacted]');
  expect(result.loop).toBe('[omitted]');
  expect(JSON.stringify(result)).not.toContain('private');
  expect((input.token as { nested: string }).nested).toBe('private');
});
