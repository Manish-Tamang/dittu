import { describe, expect, it } from 'vitest';
import { pascal, slugify } from './naming.js';

describe('naming', () => {
  it('builds component identifiers', () => {
    expect(pascal('hero-section')).toBe('HeroSection');
    expect(pascal('2024 recap')).toBe('S2024Recap');
  });
  it('builds file slugs', () => {
    expect(slugify('Hero Image (Final).PNG')).toBe('hero-image-final-png');
    expect(slugify('***')).toBe('file');
  });
});
