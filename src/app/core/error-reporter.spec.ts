import { redactUnsafeMetadata } from './error-reporter';

describe('redactUnsafeMetadata', () => {
  it('always keeps the code field', () => {
    expect(redactUnsafeMetadata({ code: 'disk-full' })).toEqual({ code: 'disk-full' });
  });

  it('drops denylisted keys even if the value looks harmless', () => {
    const result = redactUnsafeMetadata({ code: 'unknown', path: 'notes.md', content: 'hello', fileName: 'a.md' });
    expect(result).toEqual({ code: 'unknown' });
  });

  it('drops string values that look like a path (contain a separator)', () => {
    const result = redactUnsafeMetadata({ code: 'unknown', note: 'docs/notes.md' });
    expect(result).toEqual({ code: 'unknown' });
  });

  it('drops a windows-style path too', () => {
    const result = redactUnsafeMetadata({ code: 'unknown', note: 'C:\\Users\\me\\notes.md' });
    expect(result).toEqual({ code: 'unknown' });
  });

  it('drops values over the length heuristic, as a backstop against accidental file content', () => {
    const long = 'x'.repeat(200);
    const result = redactUnsafeMetadata({ code: 'unknown', note: long });
    expect(result).toEqual({ code: 'unknown' });
  });

  it('keeps a short, separator-free string value', () => {
    const result = redactUnsafeMetadata({ code: 'unknown', operation: 'save' });
    expect(result).toEqual({ code: 'unknown', operation: 'save' });
  });

  it('keeps non-string values (number/boolean) unmodified', () => {
    const result = redactUnsafeMetadata({ code: 'unknown', attempt: 2, retried: true });
    expect(result).toEqual({ code: 'unknown', attempt: 2, retried: true });
  });
});
