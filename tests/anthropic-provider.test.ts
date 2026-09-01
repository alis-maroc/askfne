import { describe, expect, it } from 'vitest';
import { buildAnthropicRequest } from '../src/lib/ai/engine';

describe('Anthropic request builder', () => {
  it('converts system and chat messages into Anthropic format', () => {
    const request = buildAnthropicRequest(
      {
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        apiKey: 'test-key',
        maxTokens: 512,
        temperature: 0.2,
      },
      [
        { role: 'system', content: 'Tu es un assistant utile.' },
        { role: 'user', content: 'Quand commence l’année scolaire ?' },
        { role: 'assistant', content: 'Le 1er septembre.' },
      ]
    );

    expect(request.model).toBe('claude-3-5-haiku-20241022');
    expect(request.max_tokens).toBe(512);
    expect(request.temperature).toBe(0.2);
    expect(request.system).toContain('Tu es un assistant utile');
    expect(request.messages).toEqual([
      { role: 'user', content: 'Quand commence l’année scolaire ?' },
      { role: 'assistant', content: 'Le 1er septembre.' },
    ]);
  });
});
