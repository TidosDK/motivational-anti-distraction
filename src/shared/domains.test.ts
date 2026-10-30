import { describe, expect, it } from 'vitest';
import { domainMatches, hostFromUrl, normalizeDomain } from './domains';

describe('normalizeDomain', () => {
  it.each([
    ['youtube.com', 'youtube.com'],
    ['https://www.YouTube.com/watch?v=x#y', 'youtube.com'],
    ['www.instagram.com/reel/abc/', 'instagram.com'],
    ['m.youtube.com', 'm.youtube.com'],
    ['youtube.com:8080', 'youtube.com'],
    ['https://user:pass@facebook.com/', 'facebook.com'],
    ['  facebook.com.  ', 'facebook.com'],
    ['SUBDOMAIN.Example.COM', 'subdomain.example.com'],
    ['xn--80ak6aa92e.com', 'xn--80ak6aa92e.com'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'not a domain',
    'youtube',
    'http://',
    'youtube .com',
    'a..b.com',
    '.com',
    'youtube.com,facebook.com',
  ])('rejects %o', (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});

describe('hostFromUrl', () => {
  it('extracts http(s) hostnames', () => {
    expect(hostFromUrl('https://m.facebook.com/story?x=1')).toBe('m.facebook.com');
    expect(hostFromUrl('http://youtube.com')).toBe('youtube.com');
  });

  it('returns null for non-web URLs and junk', () => {
    expect(hostFromUrl('chrome://extensions')).toBeNull();
    expect(hostFromUrl('chrome-extension://abc/interstitial.html')).toBeNull();
    expect(hostFromUrl('not a url')).toBeNull();
    expect(hostFromUrl('')).toBeNull();
  });
});

describe('domainMatches', () => {
  it.each([
    ['youtube.com', 'youtube.com', true],
    ['www.instagram.com', 'instagram.com', true],
    ['m.facebook.com', 'facebook.com', true],
    ['music.youtube.com', 'youtube.com', true],
    ['notyoutube.com', 'youtube.com', false],
    ['youtube.com.evil.com', 'youtube.com', false],
    ['reddit.com', 'youtube.com', false],
  ])('%s vs %s', (host, domain, expected) => {
    expect(domainMatches(host, domain)).toBe(expected);
  });
});
