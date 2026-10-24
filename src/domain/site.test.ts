import { describe, expect, it } from 'vitest';
import { routeScope, routeSegments } from './site.js';

describe('routes', () => {
  it('maps paths to file-router-safe segments', () => {
    expect(routeSegments('/')).toEqual([]);
    expect(routeSegments('/blog/my post')).toEqual(['blog', 'my-post']);
    expect(routeSegments('/_private/(group)')).toEqual(['p_private', 'group']);
  });
  it('names scopes', () => {
    expect(routeScope('/')).toBe('home');
    expect(routeScope('/blog/post')).toBe('blog-post');
  });
});
