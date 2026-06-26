import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Clapperboard,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  History,
  Layers3,
  LogIn,
  LogOut,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Undo2,
  UploadCloud
} from 'lucide-react';
import './styles.css';
import creativeBurst from './assets/creative-film-burst.png';

const MODEL_STORAGE_KEY = 'script-asset-selected-model';
const CUSTOM_MODEL_STORAGE_KEY = 'script-asset-custom-model';
const DEFAULT_MODEL_OPTIONS = ['qwen3.7-plus', 'qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'];

const COLUMNS = [
  { key: '人物角色', label: '角色名称' },
  { key: '服装', label: '服装' },
  { key: '出现集数', label: '出现集数' },
  { key: '详细描述', label: '详细描述' }
];
const SCENE_COLUMNS = [
  { key: '主要场景', label: '主要场景' },
  { key: '出现集数', label: '出现集数' },
  { key: '具体场号', label: '具体场号' },
  { key: '场次数量', label: '场次数量' },
  { key: '剧本中场景描述', label: '剧本中场景描述' }
];
const EMPTY_ROW = {
  人物角色: '',
  服装: '',
  出现集数: '',
  详细描述: ''
};
const EMPTY_SCENE_ROW = {
  主要场景: '',
  出现集数: '',
  具体场号: '',
  场次数量: '',
  剧本中场景描述: ''
};

const TABLES = {
  roles: {
    title: '角色资产表',
    badge: '角色资产',
    columns: COLUMNS,
    emptyRow: EMPTY_ROW,
    searchPlaceholder: '搜索角色、服装、场次或描述',
    emptyText: '上传剧本并分析后，角色资产会显示在这里。'
  },
  scenes: {
    title: '场景资产表',
    badge: '场景资产',
    columns: SCENE_COLUMNS,
    emptyRow: EMPTY_SCENE_ROW,
    searchPlaceholder: '搜索主要场景、集数、场号或描述',
    emptyText: '上传剧本并分析后，场景资产会显示在这里。'
  }
};

function isMeaningfulRow(row) {
  return COLUMNS.some((column) => String(row?.[column.key] || '').trim());
}

function isMeaningfulSceneRow(row) {
  return SCENE_COLUMNS.some((column) => String(row?.[column.key] || '').trim());
}

function formatProjectTime(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function areRowsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getExportFilename(projectTitle) {
  const safeTitle = String(projectTitle || '角色资产表')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();
  return `${safeTitle || '角色资产表'}.xlsx`;
}

function getStoredValue(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function App() {
  const fileInputRef = useRef(null);
  const skipProjectSaveRef = useRef(false);
  const rowsRef = useRef([]);
  const sceneRowsRef = useRef([]);
  const [health, setHealth] = useState(null);
  const [selectedModel, setSelectedModel] = useState(() => getStoredValue(MODEL_STORAGE_KEY));
  const [customModel, setCustomModel] = useState(() => getStoredValue(CUSTOM_MODEL_STORAGE_KEY));
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [files, setFiles] = useState([]);
  const [episode, setEpisode] = useState('');
  const [detectedEpisode, setDetectedEpisode] = useState('');
  const [rows, setRows] = useState([]);
  const [sceneRows, setSceneRows] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [sceneUndoStack, setSceneUndoStack] = useState([]);
  const [activeTable, setActiveTable] = useState('roles');
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [activeProjectTitle, setActiveProjectTitle] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [status, setStatus] = useState({ type: 'idle', text: '等待上传剧本文件' });
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [analysisStartedAt, setAnalysisStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    sceneRowsRef.current = sceneRows;
  }, [sceneRows]);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then((payload) => {
        setHealth(payload);
        setSelectedModel((current) => current || payload.model || 'qwen-plus');
      })
      .catch(() => setHealth({ ok: false, hasApiKey: false }));

    fetch('/api/auth/me')
      .then((response) => response.json())
      .then((payload) => {
        setUser(payload.authenticated ? payload.user : null);
        setAuthChecked(true);
      })
      .catch(() => {
        setUser(null);
        setAuthChecked(true);
      });
  }, []);

  useEffect(() => {
    if (!selectedModel) return;
    window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_MODEL_STORAGE_KEY, customModel);
  }, [customModel]);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setActiveProjectId('');
      setActiveProjectTitle('');
      return;
    }

    loadProjects({ openLatest: true });
  }, [user]);

  useEffect(() => {
    if (!user || !activeProjectId || isAnalyzing) return undefined;
    if (skipProjectSaveRef.current) {
      skipProjectSaveRef.current = false;
      return undefined;
    }

    const meaningfulRows = rows.filter(isMeaningfulRow);
    const meaningfulSceneRows = sceneRows.filter(isMeaningfulSceneRow);
    if (!meaningfulRows.length && !meaningfulSceneRows.length) return undefined;

    setIsSavingProject(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/${activeProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: activeProjectTitle,
            episode: detectedEpisode,
            rows: meaningfulRows,
            sceneRows: meaningfulSceneRows
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || '保存历史记录失败');
        setProjects((current) =>
          current
            .map((project) => (project.id === activeProjectId ? payload.project : project))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        );
      } catch (error) {
        setStatus({ type: 'warning', text: error.message || '历史记录保存失败，请稍后再试' });
      } finally {
        setIsSavingProject(false);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeProjectId, activeProjectTitle, detectedEpisode, isAnalyzing, rows, sceneRows, user]);

  useEffect(() => {
    function handleUndoShortcut(event) {
      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
      const currentStack = activeTable === 'roles' ? undoStack : sceneUndoStack;
      if (!isUndo || !user || isAnalyzing || !currentStack.length) return;
      event.preventDefault();
      undoLastChange();
    }

    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [activeTable, isAnalyzing, sceneUndoStack, undoStack, user]);

  const modelOptions = useMemo(() => {
    const options = [...(health?.models || []), ...DEFAULT_MODEL_OPTIONS];
    if (selectedModel && selectedModel !== 'custom') options.unshift(selectedModel);
    return [...new Set(options.filter(Boolean))];
  }, [health?.models, selectedModel]);
  const activeModel = selectedModel === 'custom' ? customModel.trim() : selectedModel.trim();
  const canAnalyze = files.length > 0 && !isAnalyzing && Boolean(activeModel);
  const canExport = (rows.length > 0 || sceneRows.length > 0) && !isExporting;
  const currentRows = activeTable === 'roles' ? rows : sceneRows;
  const currentColumns = TABLES[activeTable].columns;
  const currentUndoStack = activeTable === 'roles' ? undoStack : sceneUndoStack;
  const canUndo = currentUndoStack.length > 0 && !isAnalyzing;
  const rowCountText = useMemo(() => `${currentRows.length} 条记录`, [currentRows.length]);
  const filteredEntries = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return currentRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const haystack = currentColumns.map((column) => row[column.key] || '').join(' ').toLowerCase();
        const costume = String(row.服装 || '').trim();
        const scenes = String(row.出现集数 || row.具体场号 || '').trim();
        const matchesKeyword = !keyword || haystack.includes(keyword);
        const matchesFilter =
          filterMode === 'all' ||
          (activeTable === 'roles' && filterMode === 'missing-costume' && (!costume || costume === '未明确')) ||
          (filterMode === 'missing-scenes' && (!scenes || scenes === '未明确'));
        return matchesKeyword && matchesFilter;
      });
  }, [activeTable, currentColumns, currentRows, filterMode, searchTerm]);
  const filteredCountText =
    filteredEntries.length === currentRows.length ? rowCountText : `${filteredEntries.length}/${currentRows.length} 条记录`;
  const elapsedText = useMemo(() => {
    if (!isAnalyzing) return '';
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return minutes ? `${minutes}分${String(seconds).padStart(2, '0')}秒` : `${seconds}秒`;
  }, [elapsedSeconds, isAnalyzing]);
  const fileLabel = useMemo(() => {
    if (!files.length) return '选择或拖入 Word / PDF 剧本';
    if (files.length === 1) return files[0].name;
    return `已选择 ${files.length} 个剧本文件`;
  }, [files]);

  useEffect(() => {
    if (!analysisStartedAt) return undefined;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - analysisStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [analysisStartedAt]);

  function handleFileChange(event) {
    setSelectedFiles(event.target.files);
  }

  function replaceRows(nextRows) {
    const normalizedRows = cloneRows(nextRows || []);
    rowsRef.current = normalizedRows;
    setRows(normalizedRows);
    setUndoStack([]);
  }

  function replaceSceneRows(nextRows) {
    const normalizedRows = cloneRows(nextRows || []);
    sceneRowsRef.current = normalizedRows;
    setSceneRows(normalizedRows);
    setSceneUndoStack([]);
  }

  function commitRows(updater) {
    const currentRows = rowsRef.current;
    const nextRows = typeof updater === 'function' ? updater(cloneRows(currentRows)) : updater;
    const normalizedRows = cloneRows(nextRows || []);

    if (areRowsEqual(currentRows, normalizedRows)) return;

    setUndoStack((current) => [cloneRows(currentRows), ...current].slice(0, 80));
    rowsRef.current = normalizedRows;
    setRows(normalizedRows);
  }

  function commitSceneRows(updater) {
    const currentRows = sceneRowsRef.current;
    const nextRows = typeof updater === 'function' ? updater(cloneRows(currentRows)) : updater;
    const normalizedRows = cloneRows(nextRows || []);

    if (areRowsEqual(currentRows, normalizedRows)) return;

    setSceneUndoStack((current) => [cloneRows(currentRows), ...current].slice(0, 80));
    sceneRowsRef.current = normalizedRows;
    setSceneRows(normalizedRows);
  }

  function undoLastChange() {
    if (isAnalyzing) return;

    if (activeTable === 'scenes') {
      setSceneUndoStack((current) => {
        const [previousRows, ...rest] = current;
        if (!previousRows) return current;
        const restoredRows = cloneRows(previousRows);
        sceneRowsRef.current = restoredRows;
        setSceneRows(restoredRows);
        setStatus({ type: 'success', text: '已撤回上一步场景表修改' });
        return rest;
      });
      return;
    }

    if (!undoStack.length) return;

    setUndoStack((current) => {
      const [previousRows, ...rest] = current;
      if (!previousRows) return current;
      const restoredRows = cloneRows(previousRows);
      rowsRef.current = restoredRows;
      setRows(restoredRows);
      setStatus({ type: 'success', text: '已撤回上一步表格修改' });
      return rest;
    });
  }

  function setSelectedFiles(fileList) {
    const nextFiles = [...(fileList || [])].filter((item) => /\.(docx|pdf)$/i.test(item.name));
    if (!nextFiles.length) {
      setStatus({ type: 'warning', text: '请上传 .docx 或 .pdf 剧本文件' });
      return;
    }

    setFiles(nextFiles);
    setDetectedEpisode('');
    replaceRows([]);
    replaceSceneRows([]);
    setActiveProjectId('');
    setActiveProjectTitle('');
    setStatus({
      type: 'idle',
      text: nextFiles.length === 1 ? '文件已选择，可以开始整部分析' : `已选择 ${nextFiles.length} 个文件，可以开始整部分析`
    });
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    setSelectedFiles(event.dataTransfer.files);
  }

  async function analyzeScript() {
    if (!files.length) return;

    setIsAnalyzing(true);
    setAnalysisStartedAt(Date.now());
    setElapsedSeconds(0);
    setProgress(1);
    setStatus({ type: 'loading', text: '正在分段分析整部剧本，大文件可能需要几分钟...' });

    const form = new FormData();
    files.forEach((item) => form.append('scripts', item));
    if (episode.trim()) form.append('episode', episode.trim());
    if (activeModel) form.append('model', activeModel);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: form
      });
      const payload = await response.json();

      if (!response.ok) {
        setStatus({
          type: payload.requiresEpisode ? 'warning' : 'error',
          text: payload.message || '分析失败'
        });
        return;
      }

      const result = await pollAnalyzeJob(payload.jobId);
      skipProjectSaveRef.current = true;
      replaceRows(result.rows || []);
      replaceSceneRows(result.sceneRows || []);
      setDetectedEpisode(result.episode || '整部剧本');
      setActiveProjectId(result.projectId || '');
      setActiveProjectTitle(result.title || '新分析项目');
      setProgress(100);
      setStatus({
        type: 'success',
        text: `整部分析完成：角色 ${result.rows?.length || 0} 条，场景 ${result.sceneRows?.length || 0} 条，模型 ${result.model || activeModel}`
      });
      loadProjects();
    } catch (error) {
      setStatus({ type: 'error', text: error.message || '分析失败，请检查服务是否启动' });
    } finally {
      setIsAnalyzing(false);
      setAnalysisStartedAt(null);
    }
  }

  async function pollAnalyzeJob(jobId) {
    if (!jobId) throw new Error('没有收到分析任务号，请重新上传。');

    while (true) {
      await wait(1200);
      const response = await fetch(`/api/analyze/${jobId}`);
      const job = await response.json();

      if (!response.ok) throw new Error(job.message || '查询分析进度失败');

      setProgress(job.progress || 1);
      setStatus({ type: job.status === 'failed' ? 'error' : 'loading', text: job.message || '正在分析...' });

      if (job.status === 'completed') return job.result || {};
      if (job.status === 'failed') throw new Error(job.error || job.message || '分析失败');
    }
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function loadProjects(options = {}) {
    setIsLoadingProjects(true);
    try {
      const response = await fetch('/api/projects');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || '读取历史记录失败');
      const nextProjects = payload.projects || [];
      setProjects(nextProjects);

      if (options.openLatest && nextProjects.length && !rows.length && !activeProjectId) {
        await loadProject(nextProjects[0].id, { quiet: true });
      }
    } catch (error) {
      setStatus({ type: 'warning', text: error.message || '历史记录读取失败' });
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function loadProject(projectId, options = {}) {
    if (!projectId) return;
    try {
      if (!options.quiet) setStatus({ type: 'loading', text: '正在打开历史记录...' });
      const response = await fetch(`/api/projects/${projectId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || '打开历史记录失败');
      const project = payload.project;
      skipProjectSaveRef.current = true;
      setActiveProjectId(project.id);
      setActiveProjectTitle(project.title || '历史项目');
      replaceRows((project.rows || []).filter(isMeaningfulRow));
      replaceSceneRows((project.sceneRows || []).filter(isMeaningfulSceneRow));
      setDetectedEpisode(project.episode || '整部剧本');
      setEpisode('');
      setFiles([]);
      setProgress(0);
      setStatus({
        type: 'success',
        text: `已打开历史记录：${project.title || '历史项目'}，角色 ${(project.rows || []).length} 条，场景 ${(project.sceneRows || []).length} 条`
      });
    } catch (error) {
      setStatus({ type: 'error', text: error.message || '打开历史记录失败' });
    }
  }

  async function deleteProject(projectId, event) {
    event?.stopPropagation();
    if (!projectId || !window.confirm('确定删除这条历史记录吗？')) return;

    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || '删除历史记录失败');
      setProjects((current) => current.filter((project) => project.id !== projectId));
      if (activeProjectId === projectId) {
        setActiveProjectId('');
        setActiveProjectTitle('');
        replaceRows([]);
        replaceSceneRows([]);
        setDetectedEpisode('');
        setStatus({ type: 'idle', text: '历史记录已删除，可以上传新剧本继续分析' });
      }
    } catch (error) {
      setStatus({ type: 'error', text: error.message || '删除历史记录失败' });
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.message || '登录失败');
      setUser(payload.user);
      setStatus({ type: 'success', text: '登录成功，可以开始整理剧本资产' });
    } catch (error) {
      setLoginError(error.message || '登录失败');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setFiles([]);
    replaceRows([]);
    replaceSceneRows([]);
    setProjects([]);
    setActiveProjectId('');
    setActiveProjectTitle('');
    setDetectedEpisode('');
    setStatus({ type: 'idle', text: '已退出登录' });
  }

  function updateCell(index, key, value) {
    const commit = activeTable === 'roles' ? commitRows : commitSceneRows;
    commit((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
  }

  function deleteRow(index) {
    const commit = activeTable === 'roles' ? commitRows : commitSceneRows;
    commit((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function addRow() {
    const table = TABLES[activeTable];
    const commit = activeTable === 'roles' ? commitRows : commitSceneRows;
    commit((current) => [...current, { ...table.emptyRow, 出现集数: episode || '' }]);
  }

  async function exportExcel() {
    if (!rows.length && !sceneRows.length) return;

    setIsExporting(true);
    setStatus({ type: 'loading', text: '正在生成 Excel...' });

    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, sceneRows })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || '导出失败');
      }

      const blob = await response.blob();
      const savedWithPicker = await saveExcelBlob(blob, getExportFilename(activeProjectTitle));
      setStatus({
        type: 'success',
        text: savedWithPicker ? 'Excel 已保存到你选择的位置' : 'Excel 已生成，已交给浏览器下载'
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus({ type: 'idle', text: '已取消导出 Excel' });
      } else {
        setStatus({ type: 'error', text: error.message || '导出失败' });
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function saveExcelBlob(blob, suggestedName) {
    if ('showSaveFilePicker' in window) {
      setStatus({ type: 'loading', text: '请选择 Excel 保存位置...' });
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Excel 工作簿',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
            }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return false;
  }

  if (!authChecked) {
    return (
      <main className="home-shell">
        <div className="home-loading">正在点亮创意工作台...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="home-shell">
        <section className="home-stage">
          <div className="home-art">
            <div className="home-brand">
              <div className="brand-mark">
                <Clapperboard size={24} />
              </div>
              <div>
                <span>剧本资产灵感台</span>
                <h1>把整部剧本变成清晰的角色资产表</h1>
              </div>
            </div>

            <div className="home-visual">
              <img src={creativeBurst} alt="" />
              <div className="spark-card one">角色归并</div>
              <div className="spark-card two">场次追踪</div>
              <div className="spark-card three">服装资产</div>
            </div>

            <div className="home-feature-grid">
              <div>
                <strong>整部分析</strong>
                <span>上传 Word / PDF，自动按角色汇总。</span>
              </div>
              <div>
                <strong>场次标注</strong>
                <span>出现集数里保留具体场次线索。</span>
              </div>
              <div>
                <strong>Excel 导出</strong>
                <span>校对后直接交付资产统筹表。</span>
              </div>
            </div>
          </div>

          <form className="login-card" onSubmit={handleLogin}>
            <span className="login-kicker">账号登录</span>
            <h2>进入创意工作台</h2>
            <p>本地账号用于保护剧本文件、分析结果和导出内容。</p>

            <label>
              <span>账号</span>
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                autoComplete="username"
                placeholder="请输入账号"
              />
            </label>
            <label>
              <span>密码</span>
              <input
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
                type="password"
                placeholder="请输入密码"
              />
            </label>

            {loginError ? <div className="login-error">{loginError}</div> : null}

            <button className="login-button" type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
              <span>{isLoggingIn ? '登录中' : '登录并开始'}</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="workspace">
        <aside className="panel upload-panel">
          <div className="brand">
            <div className="brand-mark">
              <Clapperboard size={22} />
            </div>
            <div>
              <h1>剧本角色资产分析</h1>
              <p>按角色汇总全剧出现集数、具体场次和服装描述</p>
            </div>
          </div>

          <button className="logout-button" type="button" onClick={handleLogout}>
            <LogOut size={16} />
            <span>{user.username}</span>
          </button>

          <div className="score-strip">
            <div>
              <FileText size={16} />
              <span>文件</span>
              <strong>{files.length || '-'}</strong>
            </div>
            <div>
              <Layers3 size={16} />
              <span>角色</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <CheckCircle2 size={16} />
              <span>场景</span>
              <strong>{sceneRows.length}</strong>
            </div>
          </div>

          <div className="creative-card">
            <img src={creativeBurst} alt="" />
            <div>
              <span>创意引擎</span>
              <strong>剧本资产灵感台</strong>
            </div>
          </div>

          <div className="history-card">
            <div className="history-head">
              <div>
                <span>
                  <History size={15} />
                  历史记录
                </span>
                <strong>{projects.length ? `${projects.length} 个剧本项目` : '还没有保存项目'}</strong>
              </div>
              <button type="button" onClick={() => loadProjects()} title="刷新历史记录">
                <RefreshCw size={15} />
              </button>
            </div>

            <div className="history-list">
              {isLoadingProjects ? (
                <div className="history-empty">
                  <Loader2 className="spin" size={16} />
                  正在读取历史记录
                </div>
              ) : projects.length ? (
                projects.slice(0, 8).map((project) => (
                  <div
                    className={`history-item ${project.id === activeProjectId ? 'active' : ''}`}
                    key={project.id}
                  >
                    <button className="history-open" type="button" onClick={() => loadProject(project.id)}>
                      <FolderOpen size={17} />
                      <span>
                        <strong>{project.title}</strong>
                        <small>
                          角色 {project.rowCount} · 场景 {project.sceneRowCount || 0} · {formatProjectTime(project.updatedAt)}
                        </small>
                      </span>
                    </button>
                    <button
                      className="history-delete"
                      type="button"
                      onClick={(event) => deleteProject(project.id, event)}
                      title="删除历史记录"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="history-empty">分析完成后会自动出现在这里</div>
              )}
            </div>
          </div>

          <button
            className={`dropzone ${isDragging ? 'dragging' : ''}`}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <UploadCloud size={34} />
            <span>{fileLabel}</span>
            <small>同一角色只生成一行，出现集数会汇总到具体场次</small>
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept=".docx,.pdf"
            multiple
            onChange={handleFileChange}
          />

          <label className="field">
            <span>集数补充</span>
            <input
              value={episode}
              onChange={(event) => setEpisode(event.target.value)}
              placeholder="可留空；整部剧本会自动按正文集数整理"
            />
          </label>

          <div className="model-card">
            <div className="model-title">
              <Cpu size={16} />
              <span>分析模型</span>
            </div>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={isAnalyzing}
            >
              {modelOptions.map((model) => (
                <option value={model} key={model}>
                  {model}
                </option>
              ))}
              <option value="custom">自定义模型</option>
            </select>
            {selectedModel === 'custom' ? (
              <input
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
                disabled={isAnalyzing}
                placeholder="例如 qwen-max 或控制台里的模型 ID"
              />
            ) : null}
            <small>{activeModel ? `本次将使用：${activeModel}` : '请输入模型名称后再分析'}</small>
          </div>

          <button className="primary-button" type="button" disabled={!canAnalyze} onClick={analyzeScript}>
            {isAnalyzing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            <span>{isAnalyzing ? '分析中' : rows.length || sceneRows.length ? '重新分析' : '开始分析'}</span>
          </button>

          <div className={`status ${status.type}`}>
            <span>
              {isAnalyzing ? <Clock3 size={15} /> : null}
              {status.text}
            </span>
            {isAnalyzing && elapsedText ? <small>已用时 {elapsedText}</small> : null}
            {isAnalyzing ? (
              <div className="progress-track" aria-label="分析进度">
                <div className="progress-bar" style={{ width: `${Math.max(1, Math.min(100, progress))}%` }} />
              </div>
            ) : null}
          </div>

          <div className="meta-list">
            <div>
              <span>接口状态</span>
              <strong>{health?.ok ? '已连接' : '检查中'}</strong>
            </div>
            <div>
              <span>千问密钥</span>
              <strong>{health?.hasApiKey ? '已配置' : '未配置'}</strong>
            </div>
            <div>
              <span>当前模型</span>
              <strong>{activeModel || health?.model || 'qwen-plus'}</strong>
            </div>
          </div>
        </aside>

        <section className="table-panel">
          <header className="table-header">
            <div className="table-title">
              <span>{TABLES[activeTable].badge}</span>
              <h2>{TABLES[activeTable].title}</h2>
              <p>
                {activeProjectTitle ? `${activeProjectTitle} · ` : ''}
                {detectedEpisode ? `${detectedEpisode} · ${filteredCountText}` : filteredCountText}
              </p>
            </div>
            <div className="actions">
              <button
                className="icon-button undo-button"
                type="button"
                onClick={undoLastChange}
                disabled={!canUndo}
                title="撤回上一步（Ctrl + Z）"
              >
                <Undo2 size={18} />
              </button>
              <button className="icon-button" type="button" onClick={addRow} title="新增一行">
                <Plus size={18} />
              </button>
              <button
                className={`icon-button save-indicator ${isSavingProject ? 'saving' : ''}`}
                type="button"
                title={activeProjectId ? (isSavingProject ? '正在保存到账号历史' : '已保存到账号历史') : '分析后会保存到账号历史'}
              >
                {isSavingProject ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              </button>
              <button className="export-button" type="button" disabled={!canExport} onClick={exportExcel}>
                {isExporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
                <span>导出 Excel</span>
              </button>
            </div>
          </header>

          <div className="table-tabs">
            <button
              className={activeTable === 'roles' ? 'active' : ''}
              type="button"
              onClick={() => {
                setActiveTable('roles');
                setFilterMode('all');
              }}
            >
              角色资产表
              <strong>{rows.length}</strong>
            </button>
            <button
              className={activeTable === 'scenes' ? 'active' : ''}
              type="button"
              onClick={() => {
                setActiveTable('scenes');
                setFilterMode('all');
              }}
            >
              场景资产表
              <strong>{sceneRows.length}</strong>
            </button>
          </div>

          <div className="table-tools">
            <label className="search-field">
              <Search size={17} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={TABLES[activeTable].searchPlaceholder}
              />
            </label>
            <select value={filterMode} onChange={(event) => setFilterMode(event.target.value)}>
              <option value="all">全部记录</option>
              {activeTable === 'roles' ? <option value="missing-costume">未明确服装</option> : null}
              <option value="missing-scenes">未明确场次</option>
            </select>
          </div>

          <div className="table-wrap">
            <table className={`asset-table ${activeTable}-table`}>
              <thead>
                <tr>
                  {currentColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th className="delete-col"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length ? (
                  filteredEntries.map(({ row, index }) => (
                    <tr key={`${activeTable}-${index}-${row.人物角色 || row.主要场景}-${row.出现集数 || row.具体场号}`}>
                      {currentColumns.map((column) => (
                        <td key={column.key}>
                          <textarea
                            value={row[column.key] || ''}
                            onChange={(event) => updateCell(index, column.key, event.target.value)}
                            rows={column.key === '详细描述' || column.key === '剧本中场景描述' ? 3 : 2}
                          />
                        </td>
                      ))}
                      <td className="delete-col">
                        <button
                          className="delete-button"
                          type="button"
                          onClick={() => deleteRow(index)}
                          title="删除这一行"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-cell" colSpan={currentColumns.length + 1}>
                      {currentRows.length ? '没有匹配当前搜索或筛选条件的记录。' : TABLES[activeTable].emptyText}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
