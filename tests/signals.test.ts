import { describe, expect, it } from 'vitest';
import { signal, computed } from '../src/app/core';

describe('signals', () => {
  it('should update signal value', () => {
    const count = signal(1);
    count.set(2);

    expect(count()).toBe(2);
  });

  it('should compute derived values', () => {
    const name = signal('Nexular');
    const greeting = computed(() => `Hello ${name()}`);

    expect(greeting()).toBe('Hello Nexular');

    name.set('Framework');
    expect(greeting()).toBe('Hello Framework');
  });
});
