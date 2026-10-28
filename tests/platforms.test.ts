import { describe, expect, it } from 'vitest';
import { accountUrl, platformColor, platformOrder, PLATFORMS } from '@/lib/platforms';
import { platformLabel } from '@/lib/format';

describe('platform list', () => {
  it('knows Twitch: name, purple, and the channel link from the lowercase login', () => {
    expect(platformLabel('twitch')).toBe('Twitch');
    expect(platformLabel('TWITCH')).toBe('Twitch');
    expect(platformColor('twitch')).toBe('#9146FF');
    expect(accountUrl('twitch', 'caedrel')).toBe('https://twitch.tv/caedrel');
    expect(accountUrl('twitch', 'CaedRel')).toBe('https://twitch.tv/caedrel');
    expect(accountUrl('twitch', '  ')).toBeNull();
  });

  it('keeps the other platforms rules unchanged', () => {
    expect(accountUrl('tiktok', 'some.one')).toBe('https://www.tiktok.com/@some.one');
    expect(accountUrl('kick', 'someone')).toBeNull();
    expect(accountUrl('youtube', 'someone')).toBeNull();
    expect(platformLabel('twitter')).toBe('Twitter / X');
    expect(platformLabel('x')).toBe('Twitter / X');
  });

  it('handles platforms it has never heard of', () => {
    expect(platformLabel('bluesky')).toBe('Bluesky');
    expect(platformColor('bluesky')).toBe('#8b8b95');
    expect(accountUrl('bluesky', 'a')).toBeNull();
  });

  it('orders known platforms first, unknown last', () => {
    const sorted = ['tiktok', 'bluesky', 'twitch', 'youtube', 'kick'].sort((a, b) => platformOrder(a) - platformOrder(b));
    expect(sorted).toEqual(['youtube', 'kick', 'twitch', 'tiktok', 'bluesky']);
    expect(Object.keys(PLATFORMS)).toContain('twitch');
  });
});
