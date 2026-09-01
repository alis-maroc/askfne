import { describe, expect, it } from 'vitest';
import { findMatchingCannedResponse } from '../src/lib/ai/engine';

describe('findMatchingCannedResponse', () => {
  it('matches general canned responses even when a category menu is selected', () => {
    const responses = [
      {
        id: '1',
        title: 'الموقع الرسمي للجامعة',
        content: 'https://www.university.edu',
        category: 'General',
        shortcut: 'site',
        isActive: true,
      },
    ];

    const result = findMatchingCannedResponse('الموقع الرسمي للجامعة', responses, '4');

    expect(result?.title).toBe('الموقع الرسمي للجامعة');
  });

  it('matches official website synonyms for a university link', () => {
    const responses = [
      {
        id: '2',
        title: 'الرابط الإلكتروني للجامعة',
        content: 'https://www.university.edu',
        category: 'General',
        shortcut: 'web',
        isActive: true,
      },
    ];

    const result = findMatchingCannedResponse('الرابط الإلكتروني للجامعة', responses, '4');

    expect(result?.title).toBe('الرابط الإلكتروني للجامعة');
  });
});
