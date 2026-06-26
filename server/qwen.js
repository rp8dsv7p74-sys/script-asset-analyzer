import { mergeRoleRows, mergeSceneRows } from './mergeRows.js';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-plus';
const DEFAULT_CHARS_PER_CHUNK = 40000;
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_CONCURRENCY = 2;

const EPISODE_HEADING_PATTERN =
  /(?:^|\n)\s*(?:第\s*([0-9]{1,3}|[零一二两三四五六七八九十百]{1,6})\s*[集话回]|(?:EP|E|Episode|Ep)\s*0*([0-9]{1,3})\b)/gi;

function chunkText(text) {
  const clean = text.replace(/\r/g, '').trim();
  const maxChars = getMaxCharsPerChunk();
  if (clean.length <= maxChars) return [{ text: clean, episodeHint: '' }];

  const episodeChunks = chunkTextByEpisode(clean);
  if (episodeChunks.length > 1) return splitLargeChunks(episodeChunks, maxChars);

  return splitLargeChunks([{ text: clean, episodeHint: '' }], maxChars);
}

function chunkTextByEpisode(text) {
  const matches = [...text.matchAll(EPISODE_HEADING_PATTERN)];
  if (matches.length < 2) return [{ text, episodeHint: '' }];

  const chunks = [];
  const preface = text.slice(0, matches[0].index).trim();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index;
    const end = matches[index + 1]?.index ?? text.length;
    const episodeHint = match[1] || match[2] || '';
    const section = `${preface && index === 0 ? `${preface}\n` : ''}${text.slice(start, end)}`.trim();
    if (section) {
      chunks.push({
        text: section,
        episodeHint: episodeHint ? formatEpisodeHint(episodeHint) : ''
      });
    }
  }
  return chunks;
}

function formatEpisodeHint(value) {
  return /^\d+$/.test(value) ? `第${Number(value)}集` : `第${value}集`;
}

function splitLargeChunks(chunks, maxChars) {
  const result = [];
  for (const chunk of chunks) {
    if (chunk.text.length <= maxChars) {
      result.push(chunk);
      continue;
    }

    for (let start = 0; start < chunk.text.length; start += maxChars) {
      result.push({
        text: chunk.text.slice(start, start + maxChars),
        episodeHint: chunk.episodeHint
      });
    }
  }
  return result;
}

function getMaxCharsPerChunk() {
  return readPositiveInt(process.env.ANALYSIS_CHUNK_CHARS, DEFAULT_CHARS_PER_CHUNK);
}

function getQwenTimeoutMs() {
  return readPositiveInt(process.env.QWEN_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function getQwenConcurrency() {
  return readPositiveInt(process.env.QWEN_CONCURRENCY, DEFAULT_CONCURRENCY);
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRow(row, fallbackEpisode) {
  return {
    人物角色: String(row?.人物角色 || row?.role || row?.character || '').trim(),
    服装: String(row?.服装 || row?.costume || '').trim(),
    出现集数: String(row?.出现集数 || row?.episode || fallbackEpisode || '未明确').trim(),
    详细描述: String(row?.详细描述 || row?.description || '').trim()
  };
}

function normalizeSceneRow(row, fallbackEpisode) {
  return {
    主要场景: String(row?.主要场景 || row?.scene || row?.location || '').trim(),
    出现集数: String(row?.出现集数 || row?.episode || fallbackEpisode || '未明确').trim(),
    具体场号: String(row?.具体场号 || row?.场号 || row?.sceneNumber || row?.scene_no || '').trim(),
    场次数量: String(row?.场次数量 || row?.count || '').trim(),
    剧本中场景描述: String(row?.剧本中场景描述 || row?.场景描述 || row?.description || '').trim()
  };
}

function extractJson(content) {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);

    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
    }

    throw new Error('千问返回的内容不是有效 JSON。');
  }
}

async function callQwen({ apiKey, baseUrl, model, text, episode, filename, partIndex, partCount }) {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const episodeInstruction = episode
    ? `本段默认出现集数：${episode}。如果正文中出现更明确的集数标题，以正文标题为准。`
    : '这是整部或多集剧本的一部分。请必须根据正文里的“第X集 / EPX / Episode X”等标题判断每条记录的出现集数；无法判断时写“未明确”。';
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getQwenTimeoutMs());
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是影视剧本资产统筹助理。你只输出 JSON，不输出解释。任务是从剧本文本中同时提取角色资产表和场景资产表。'
          },
          {
            role: 'user',
            content: [
              `文件名：${filename}`,
              episodeInstruction,
              `分段：${partIndex + 1}/${partCount}`,
              '',
              '请同时提取两张表：角色资产表、场景资产表。',
              '输出 JSON 对象，格式必须为：{"roleRows":[{"人物角色":"","服装":"","出现集数":"","详细描述":""}],"sceneRows":[{"主要场景":"","出现集数":"","具体场号":"","场次数量":"","剧本中场景描述":""}]}',
              '角色资产表规则：',
              '1. 角色表只能使用“人物角色、服装、出现集数、详细描述”四个字段，不要增加演员、部门、备注等字段。',
              '2. 同一个人物只能输出一行，绝对不要按每一集重复输出同一人物。',
              '3. 出现集数要汇总这个人物出现的全部集数和具体场次，优先使用剧本里的场次编号，例如“第1集1-1场、1-2场；第2集2-1场”。如果正文只有“1-1、2-3”这样的场次号，也要保留。',
              '4. 服装写这个人物在全剧中出现过的服装/造型，可用“服装：场次”的形式合并；没有明确信息时写“未明确”。',
              '5. 详细描述写人物整体身份、性格、年龄、关系、核心行为和资产统筹需要关注的信息。',
              '场景资产表规则：',
              '6. 场景表只能使用“主要场景、出现集数、具体场号、场次数量、剧本中场景描述”五个字段。',
              '7. 主要场景要合并同类地点，例如“外太空/宇宙战场/太空战场”可合并为一个主要场景；不要按每一场重复输出同一地点。',
              '8. 出现集数写该场景出现的集数列表，例如“第20集、第21集”。具体场号写所有场号，例如“20-1、21-1、22-2”。',
              '9. 场次数量按具体场号去重计数。无法确定时写空字符串，不要编造。',
              '10. 剧本中场景描述要概括剧本里的空间位置、昼夜、视觉元素、动作调度、重要事件和美术/置景/特效注意点。',
              '11. 不要把“第1集、第2集”单独当作足够结果；角色和场景都必须尽量标注到具体场次。',
              '',
              '剧本文本：',
              text
            ].join('\n')
          }
        ]
      })
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('千问处理超时：当前剧本分段过长或接口繁忙，请稍后重试。');
    }
    throw new Error(`无法连接千问接口，请检查网络或代理设置。原始错误：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`千问接口调用失败：${response.status} ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('千问没有返回可分析的内容。');

  const parsed = extractJson(content);
  const roleRows = Array.isArray(parsed) ? parsed : parsed.roleRows || parsed.rows;
  const sceneRows = Array.isArray(parsed?.sceneRows) ? parsed.sceneRows : [];
  if (!Array.isArray(roleRows)) throw new Error('千问返回 JSON 中缺少 roleRows 数组。');

  return {
    roleRows: roleRows.map((row) => normalizeRow(row, episode)),
    sceneRows: sceneRows.map((row) => normalizeSceneRow(row, episode))
  };
}

export function getDefaultModel() {
  return process.env.QWEN_MODEL || DEFAULT_MODEL;
}

export function getModelOptions() {
  const configured = String(process.env.QWEN_MODEL_OPTIONS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const defaults = [
    getDefaultModel(),
    'qwen-plus',
    'qwen-max',
    'qwen-turbo',
    'qwen-long',
    'qwen3.7-plus'
  ];

  return [...new Set([...configured, ...defaults])];
}

export async function analyzeWithQwen({ text, episode, filename, model: requestedModel, onProgress }) {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    const error = new Error('缺少 QWEN_API_KEY，请先在 .env 文件中填写千问 API 密钥。');
    error.status = 400;
    throw error;
  }

  const baseUrl = process.env.QWEN_BASE_URL || DEFAULT_BASE_URL;
  const model = requestedModel || getDefaultModel();
  const chunks = chunkText(text);
  const allRoleRows = [];
  const allSceneRows = [];
  let completedChunks = 0;

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < chunks.length) {
      const index = nextIndex;
      nextIndex += 1;
      const chunk = chunks[index];
      console.log(`Analyzing ${filename}: chunk ${index + 1}/${chunks.length}`);
      const result = await callQwen({
        apiKey,
        baseUrl,
        model,
        text: chunk.text,
        episode: episode || chunk.episodeHint,
        filename,
        partIndex: index,
        partCount: chunks.length
      });
      allRoleRows.push(...result.roleRows);
      allSceneRows.push(...result.sceneRows);
      completedChunks += 1;
      onProgress?.({
        completed: completedChunks,
        total: chunks.length,
        filename
      });
    }
  }

  const workerCount = Math.min(getQwenConcurrency(), chunks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    roleRows: mergeRoleRows(allRoleRows),
    sceneRows: mergeSceneRows(allSceneRows)
  };
}
