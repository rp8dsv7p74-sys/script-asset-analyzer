import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEpisode } from './episode.js';

test('detects Chinese episode pattern from filename', () => {
  assert.equal(detectEpisode('某剧_第03集.docx'), '第3集');
});

test('detects EP pattern from filename', () => {
  assert.equal(detectEpisode('show_EP02.pdf'), '第2集');
});

test('detects bare episode number from filename', () => {
  assert.equal(detectEpisode('03.pdf'), '第3集');
});

test('detects episode from document title text', () => {
  assert.equal(detectEpisode('script.docx', '电视剧项目\n第十二集\n场景一'), '第12集');
});

test('returns null when no episode exists', () => {
  assert.equal(detectEpisode('script.docx', '人物对白'), null);
});
