const CHINESE_NUMBERS = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
};

function chineseToNumber(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === '十') return 10;

  const tenIndex = value.indexOf('十');
  if (tenIndex >= 0) {
    const left = value.slice(0, tenIndex);
    const right = value.slice(tenIndex + 1);
    const tens = left ? CHINESE_NUMBERS[left] : 1;
    const ones = right ? CHINESE_NUMBERS[right] : 0;
    return typeof tens === 'number' && typeof ones === 'number' ? tens * 10 + ones : null;
  }

  if (value.length === 1 && CHINESE_NUMBERS[value] !== undefined) {
    return CHINESE_NUMBERS[value];
  }

  return null;
}

function formatEpisode(value) {
  const number = chineseToNumber(String(value).trim());
  if (!number || Number.isNaN(number)) return null;
  return `第${number}集`;
}

export function detectEpisode(...sources) {
  const joined = sources.filter(Boolean).join('\n').slice(0, 5000);
  if (!joined) return null;

  const patterns = [
    /第\s*([0-9]{1,3}|[零一二两三四五六七八九十]{1,4})\s*[集话回]/i,
    /(?:EP|E|Episode|Ep)\s*0*([0-9]{1,3})\b/i,
    /(?:^|[^\d])0*([0-9]{1,3})\s*[集话回](?:[^\d]|$)/i
  ];

  for (const pattern of patterns) {
    const match = joined.match(pattern);
    if (match) return formatEpisode(match[1]);
  }

  const filenameOnly = String(sources[0] || '');
  const bareNumber = filenameOnly.match(/(?:^|[^\d])0*([0-9]{1,3})(?:[^\d]|$)/);
  if (bareNumber) return formatEpisode(bareNumber[1]);

  return null;
}
