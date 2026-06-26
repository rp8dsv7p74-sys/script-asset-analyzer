import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { analyzeWithQwen, getDefaultModel, getModelOptions } from './qwen.js';
import { detectEpisode } from './episode.js';
import { createWorkbookBuffer } from './xlsx.js';
import { mergeRoleRows, mergeSceneRows } from './mergeRows.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'app-data.json');
const CLIENT_DIST = path.resolve(__dirname, '..', 'dist');
const app = express();
const jobs = new Map();
const sessions = new Map();
let storeWriteQueue = Promise.resolve();
const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || '123456';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024
  }
});

app.use(express.json({ limit: '5mb' }));

app.use((req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const session = cookies.script_asset_session ? sessions.get(cookies.script_asset_session) : null;
  req.user = session ? { username: session.username } : null;
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: getDefaultModel(),
    models: getModelOptions(),
    hasApiKey: Boolean(process.env.QWEN_API_KEY)
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({
    authenticated: Boolean(req.user),
    user: req.user
  });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (username !== APP_USERNAME || password !== APP_PASSWORD) {
    return res.status(401).json({ message: '账号或密码不正确。' });
  }

  const sessionId = randomUUID();
  sessions.set(sessionId, {
    username,
    createdAt: Date.now()
  });

  res.setHeader('Set-Cookie', createSessionCookie(sessionId));
  res.json({
    authenticated: true,
    user: { username }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.script_asset_session) sessions.delete(cookies.script_asset_session);
  res.setHeader('Set-Cookie', 'script_asset_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const projects = await listProjects(req.user.username);
    res.json({ projects });
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/projects/:projectId', requireAuth, async (req, res) => {
  try {
    const project = await getProject(req.user.username, req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: '没有找到这条历史记录。' });
    }
    res.json({ project });
  } catch (error) {
    respondWithError(res, error);
  }
});

app.put('/api/projects/:projectId', requireAuth, async (req, res) => {
  try {
    const project = await updateProject(req.user.username, req.params.projectId, {
      title: req.body?.title,
      episode: req.body?.episode,
      rows: req.body?.rows,
      sceneRows: req.body?.sceneRows
    });
    res.json({ project: summarizeProject(project) });
  } catch (error) {
    respondWithError(res, error);
  }
});

app.delete('/api/projects/:projectId', requireAuth, async (req, res) => {
  try {
    await deleteProject(req.user.username, req.params.projectId);
    res.json({ ok: true });
  } catch (error) {
    respondWithError(res, error);
  }
});

app.post('/api/analyze', requireAuth, upload.array('scripts', 20), async (req, res) => {
  try {
    const files = (req.files || []).map((file) => ({
      ...file,
      originalname: normalizeTextEncoding(file.originalname)
    }));
    if (!files.length) {
      return res.status(400).json({ message: '请先上传 .docx 或 .pdf 剧本文件。' });
    }

    const episodeOverride = String(req.body.episode || '').trim();
    const modelOverride = normalizeModelName(req.body.model);
    const jobId = createJob({ totalFiles: files.length, username: req.user.username, model: modelOverride || getDefaultModel() });
    res.status(202).json({ jobId });
    runAnalysisJob(jobId, files, episodeOverride, modelOverride);
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/analyze/:jobId', requireAuth, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ message: '没有找到这个分析任务，请重新上传剧本。' });
  }

  res.json(job);
});

async function runAnalysisJob(jobId, files, episodeOverride, modelOverride) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    const allRows = [];
    const allSceneRows = [];
    const analyzedFiles = [];

    for (const file of files) {
      const fileIndex = analyzedFiles.length;
      updateJob(jobId, {
        status: 'running',
        message: `正在读取 ${file.originalname}`,
        progress: Math.max(job.progress, Math.round((fileIndex / files.length) * 8))
      });

      const extension = getExtension(file.originalname);
      if (!['.docx', '.pdf'].includes(extension)) {
        throw new Error(`暂时只支持 .docx 和 .pdf 文件：${file.originalname}`);
      }

      const text = await extractText(file, extension);
      if (!text.trim()) {
        throw new Error(`没有从文件中读取到可分析的文字内容：${file.originalname}`);
      }

      const episode = episodeOverride || detectEpisode(file.originalname, text) || '';
      updateJob(jobId, {
        status: 'running',
        message: `正在分析 ${file.originalname}`,
        progress: Math.max(job.progress, Math.round(8 + (fileIndex / files.length) * 87))
      });

      const analysis = await analyzeWithQwen({
        text,
        episode,
        model: modelOverride,
        filename: file.originalname,
        onProgress: ({ completed, total }) => {
          const fileShare = (fileIndex + completed / total) / files.length;
          updateJob(jobId, {
            status: 'running',
            message: `正在分析 ${file.originalname}：第 ${completed}/${total} 段`,
            progress: Math.min(95, Math.round(8 + fileShare * 87))
          });
        }
      });

      allRows.push(...analysis.roleRows);
      allSceneRows.push(...analysis.sceneRows);
      analyzedFiles.push({
        filename: file.originalname,
        episode: episode || '整部剧本'
      });
    }

    const rows = mergeRoleRows(allRows);
    const sceneRows = mergeSceneRows(allSceneRows);
    const episode = episodeOverride || (analyzedFiles.length === 1 ? analyzedFiles[0].episode : '整部剧本');
    const project = await createProject(job.username, {
      files: analyzedFiles,
      episode,
      model: modelOverride || getDefaultModel(),
      rows,
      sceneRows
    });

    updateJob(jobId, {
      status: 'completed',
      message: '分析完成，可以校对和导出',
      progress: 100,
      result: {
        projectId: project.id,
        title: project.title,
        files: analyzedFiles,
        episode,
        model: modelOverride || getDefaultModel(),
        rows,
        sceneRows
      }
    });
  } catch (error) {
    updateJob(jobId, {
      status: 'failed',
      message: error.message || '分析失败，请稍后重试。',
      progress: 100,
      error: error.message || '分析失败，请稍后重试。'
    });
  }
}

app.post('/api/export', requireAuth, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const sceneRows = Array.isArray(req.body?.sceneRows) ? req.body.sceneRows : [];
    if (!rows.length && !sceneRows.length) {
      return res.status(400).json({ message: '没有可导出的表格数据。' });
    }

    const normalized = rows.map((row) => ({
      人物角色: String(row.人物角色 || '').trim(),
      服装: String(row.服装 || '').trim(),
      出现集数: String(row.出现集数 || '').trim(),
      详细描述: String(row.详细描述 || '').trim()
    }));
    const normalizedScenes = sceneRows.map((row) => ({
      主要场景: String(row.主要场景 || '').trim(),
      出现集数: String(row.出现集数 || '').trim(),
      具体场号: String(row.具体场号 || '').trim(),
      场次数量: String(row.场次数量 || '').trim(),
      剧本中场景描述: String(row.剧本中场景描述 || '').trim()
    }));

    const buffer = createWorkbookBuffer(normalized, normalizedScenes);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', encodeURIComponentHeader('剧本资产表.xlsx'));
    res.send(buffer);
  } catch (error) {
    respondWithError(res, error);
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ message: '接口不存在。' });
});

app.use(express.static(CLIENT_DIST));

app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'), (error) => {
    if (error && !res.headersSent) {
      res.status(404).send('前端页面还没有构建，请先运行 npm run build。');
    }
  });
});

async function extractText(file, extension) {
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  const result = await pdfParse(file.buffer);
  return result.text;
}

function getExtension(filename) {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : '';
}

function encodeURIComponentHeader(filename) {
  return `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf('=');
        return index === -1
          ? [decodeURIComponent(cookie), '']
          : [decodeURIComponent(cookie.slice(0, index)), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function createSessionCookie(sessionId) {
  const maxAge = 60 * 60 * 24 * 7;
  return `script_asset_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ message: '请先登录后再使用。' });
}

function normalizeModelName(value) {
  const model = String(value || '').trim();
  if (!model) return '';
  if (!/^[\w.:-]+$/i.test(model)) {
    const error = new Error('模型名称只能包含字母、数字、点、冒号、下划线和短横线。');
    error.status = 400;
    throw error;
  }
  return model;
}

function createJob({ totalFiles, username, model }) {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  jobs.set(jobId, {
    id: jobId,
    username,
    model,
    status: 'queued',
    message: '任务已创建，准备读取剧本',
    progress: 1,
    totalFiles,
    createdAt: new Date().toISOString()
  });

  setTimeout(() => jobs.delete(jobId), 1000 * 60 * 60);
  return jobId;
}

function updateJob(jobId, patch) {
  const current = jobs.get(jobId);
  if (!current) return;
  jobs.set(jobId, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

function respondWithError(res, error) {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || '处理失败，请稍后重试。'
  });
}

function createEmptyStore() {
  return {
    version: 1,
    users: {}
  };
}

async function readStore() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : createEmptyStore();
  } catch (error) {
    if (error.code === 'ENOENT') return createEmptyStore();
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tempFile, DATA_FILE);
}

async function updateStore(mutator) {
  const nextWrite = storeWriteQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
  storeWriteQueue = nextWrite.catch(() => {});
  return nextWrite;
}

function getUserStore(store, username) {
  if (!store.users) store.users = {};
  if (!store.users[username]) store.users[username] = { projects: [] };
  if (!Array.isArray(store.users[username].projects)) store.users[username].projects = [];
  return store.users[username];
}

function summarizeProject(project) {
  const normalized = normalizeProject(project);
  return {
    id: normalized.id,
    title: normalized.title,
    episode: normalized.episode,
    model: normalized.model || getDefaultModel(),
    files: normalized.files || [],
    rowCount: Array.isArray(normalized.rows) ? normalized.rows.length : 0,
    sceneRowCount: Array.isArray(normalized.sceneRows) ? normalized.sceneRows.length : 0,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
}

function sanitizeRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      人物角色: String(row?.人物角色 || '').trim(),
      服装: String(row?.服装 || '').trim(),
      出现集数: String(row?.出现集数 || '').trim(),
      详细描述: String(row?.详细描述 || '').trim()
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

function sanitizeSceneRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      主要场景: String(row?.主要场景 || '').trim(),
      出现集数: String(row?.出现集数 || '').trim(),
      具体场号: String(row?.具体场号 || '').trim(),
      场次数量: String(row?.场次数量 || '').trim(),
      剧本中场景描述: String(row?.剧本中场景描述 || '').trim()
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

function createProjectTitle(files) {
  const first = files?.[0]?.filename || '剧本分析';
  const base = normalizeTextEncoding(first).replace(/\.[^.]+$/, '');
  return files.length > 1 ? `${base} 等 ${files.length} 个文件` : base;
}

function normalizeProject(project) {
  if (!project || typeof project !== 'object') return project;
  const files = Array.isArray(project.files)
    ? project.files.map((file) => ({
        ...file,
        filename: normalizeTextEncoding(file.filename),
        episode: normalizeTextEncoding(file.episode)
      }))
    : [];

  return {
    ...project,
    title: normalizeTextEncoding(project.title) || createProjectTitle(files),
    episode: normalizeTextEncoding(project.episode) || '整部剧本',
    model: normalizeModelName(project.model) || getDefaultModel(),
    files,
    rows: sanitizeRows(project.rows),
    sceneRows: sanitizeSceneRows(project.sceneRows)
  };
}

function normalizeTextEncoding(value) {
  const text = String(value || '').trim();
  if (!text || !looksLikeMojibake(text)) return text;

  const decoded = Buffer.from(text, 'latin1').toString('utf8').trim();
  if (!decoded || decoded.includes('\uFFFD')) return text;

  const originalScore = countCjkCharacters(text);
  const decodedScore = countCjkCharacters(decoded);
  return decodedScore > originalScore ? decoded : text;
}

function looksLikeMojibake(text) {
  return /[ÃÂ]|[\u0080-\u00BF]|[äåæçèéïðã]/.test(text);
}

function countCjkCharacters(text) {
  return (text.match(/[\u3400-\u9FFF]/g) || []).length;
}

async function listProjects(username) {
  const store = await readStore();
  const userStore = getUserStore(store, username);
  return userStore.projects
    .map(summarizeProject)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function getProject(username, projectId) {
  const store = await readStore();
  const userStore = getUserStore(store, username);
  const project = userStore.projects.find((item) => item.id === projectId);
  return project ? normalizeProject(project) : null;
}

async function createProject(username, payload) {
  return updateStore((store) => {
    const userStore = getUserStore(store, username);
    const now = new Date().toISOString();
    const files = (Array.isArray(payload.files) ? payload.files : []).map((file) => ({
      ...file,
      filename: normalizeTextEncoding(file.filename),
      episode: normalizeTextEncoding(file.episode)
    }));
    const project = {
      id: randomUUID(),
      title: createProjectTitle(files),
      episode: payload.episode || '整部剧本',
      model: normalizeModelName(payload.model) || getDefaultModel(),
      files,
      rows: sanitizeRows(payload.rows),
      sceneRows: sanitizeSceneRows(payload.sceneRows),
      createdAt: now,
      updatedAt: now
    };
    userStore.projects.unshift(project);
    return project;
  });
}

async function updateProject(username, projectId, payload) {
  return updateStore((store) => {
    const userStore = getUserStore(store, username);
    const project = userStore.projects.find((item) => item.id === projectId);
    if (!project) {
      const error = new Error('没有找到这条历史记录。');
      error.status = 404;
      throw error;
    }

    if (typeof payload.title === 'string' && payload.title.trim()) {
      project.title = normalizeTextEncoding(payload.title);
    }
    if (typeof payload.episode === 'string') {
      project.episode = normalizeTextEncoding(payload.episode) || '整部剧本';
    }
    if (Array.isArray(payload.rows)) {
      project.rows = sanitizeRows(payload.rows);
    }
    if (Array.isArray(payload.sceneRows)) {
      project.sceneRows = sanitizeSceneRows(payload.sceneRows);
    }
    project.updatedAt = new Date().toISOString();
    return project;
  });
}

async function deleteProject(username, projectId) {
  return updateStore((store) => {
    const userStore = getUserStore(store, username);
    const nextProjects = userStore.projects.filter((item) => item.id !== projectId);
    if (nextProjects.length === userStore.projects.length) {
      const error = new Error('没有找到这条历史记录。');
      error.status = 404;
      throw error;
    }
    userStore.projects = nextProjects;
  });
}

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Script asset analyzer API running on http://127.0.0.1:${port}`);
});
