import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  Download,
  ExternalLink,
  Filter,
  HelpCircle,
  Loader2,
  MessageSquare,
  Moon,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { CURATED_DISPATCHES, DEFAULT_SOURCES } from './data/curatedDispatches';
import {
  BeginnerThreatGuide,
  CyberDispatch,
  DispatchCategory,
  NewsSourceConfig,
  SeverityLevel,
} from './types/news';

type ActiveSection = 'feed' | 'vulnerabilities' | 'advisories' | 'sources' | 'read-later';
type DrawerTab = 'technical' | 'beginner-ai';

const READ_LATER_STORAGE_KEY = 'sentinel_wire_read_later_v1';
const THEME_STORAGE_KEY = 'sentinel_wire_theme_v1';

function formatRelativeTime(isoDate: string): string {
  if (!isoDate || Number.isNaN(Date.parse(isoDate))) return 'not yet synced';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSec = Math.max(1, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatUtcClock(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'not yet synced';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function getSeverityTextStyle(severity: SeverityLevel): string {
  switch (severity) {
    case SeverityLevel.CRITICAL:
      return 'text-red-700 dark:text-red-400 font-semibold';
    case SeverityLevel.HIGH:
      return 'text-amber-700 dark:text-amber-400 font-semibold';
    case SeverityLevel.ELEVATED:
      return 'text-sky-700 dark:text-sky-400 font-medium';
    case SeverityLevel.INFORMATIONAL:
    default:
      return 'text-stone-600 dark:text-slate-400 font-medium';
  }
}

interface ResilientEditorialImageProps {
  src?: string;
  alt: string;
  caption?: string;
  aspectClass?: string;
  category: string;
}

const ResilientEditorialImage: React.FC<ResilientEditorialImageProps> = ({
  src,
  alt,
  caption,
  aspectClass = 'aspect-video',
  category,
}) => {
  const [hasError, setHasError] = useState(false);

  return (
    <figure className="w-full">
      <div
        className={`relative w-full ${aspectClass} overflow-hidden bg-stone-200/80 dark:bg-slate-900 border border-stone-200 dark:border-slate-800`}
      >
        {src && !hasError ? (
          <img
            src={src}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => setHasError(true)}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
          />
        ) : (
          <div className="w-full h-full flex flex-col justify-between p-6 bg-gradient-to-br from-stone-200 via-stone-100 to-stone-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 text-stone-600 dark:text-slate-400">
            <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest">
              <span>{category}</span>
              <span>Sentinel Archive</span>
            </div>
            <div className="my-auto py-4">
              <ShieldAlert className="w-7 h-7 text-stone-500 dark:text-slate-500 mb-2" />
              <p className="text-sm font-serif text-stone-800 dark:text-slate-200 line-clamp-2">
                {alt}
              </p>
            </div>
            <div className="text-[11px] font-mono text-stone-500 dark:text-slate-500">
              Illustrative image
            </div>
          </div>
        )}
      </div>
      {caption && (
        <figcaption className="text-xs font-serif italic text-stone-500 dark:text-slate-400 mt-2 leading-relaxed">
          {caption}
        </figcaption>
      )}
    </figure>
  );
};

interface QaExchange {
  question: string;
  answer: string;
}

export default function App() {
  // Theme state synced with <html class="dark">
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage quota errors
    }
  }, [darkMode]);

  // Navigation & Feed data
  const [activeSection, setActiveSection] = useState<ActiveSection>('feed');
  const [liveDispatches, setDispatches] = useState<CyberDispatch[]>([]);
  const [showDemo, setShowDemo] = useState(false);
  const dispatches = showDemo ? CURATED_DISPATCHES : liveDispatches;
  const [serverSources, setSources] = useState<NewsSourceConfig[]>(DEFAULT_SOURCES);
  const [mutedSourceIds, setMutedSourceIds] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('sentinel_wire_muted_v1') || '[]');
      return Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];
    } catch { return []; }
  });
  const sources = useMemo(() => serverSources.map(s => ({ ...s, enabled: !mutedSourceIds.includes(s.id) })), [serverSources, mutedSourceIds]);
  useEffect(() => {
    try { localStorage.setItem('sentinel_wire_muted_v1', JSON.stringify(mutedSourceIds)); } catch { /* Storage is optional. */ }
  }, [mutedSourceIds]);
  const [ownerToken, setOwnerToken] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [feedError, setFeedError] = useState('');
  const syncingRef = useRef(false);
  useEffect(() => {
    fetch('/api/config', { signal: AbortSignal.timeout(10000) }).then(r => r.json()).then(c => setAiEnabled(c.aiEnabled === true)).catch(() => {});
  }, []);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [autoPollEnabled, setAutoPollEnabled] = useState<boolean>(true);

  // Filtering & Categorization state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('ALL');
  const [onlyExploitedKev, setOnlyExploitedKev] = useState<boolean>(false);

  // Read Later state persisted in localStorage (works without login)
  const [savedArticles, setSavedArticles] = useState<CyberDispatch[]>(() => {
    try {
      const raw = localStorage.getItem(READ_LATER_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(a => a && typeof a.id === 'string' && typeof a.title === 'string' && typeof a.summary === 'string' && Array.isArray(a.leadBody) && typeof a.sourceName === 'string' && typeof a.category === 'string').map(a => a.isLiveRss ? ({ ...a, dataOrigin: 'live', severity: SeverityLevel.UNKNOWN, cvssScore: undefined, activelyExploited: undefined }) : ({ ...a, dataOrigin: 'demo', title: a.title.startsWith('[DEMO]') ? a.title : `[DEMO] ${a.title}` })) : [];
    } catch {
      return [];
    }
  });

  const [readLaterSearch, setReadLaterSearch] = useState<string>('');
  const [readLaterCategory, setReadLaterCategory] = useState<string>('ALL');

  // Selected dispatch & active tab for reader drawer
  const [activeDispatch, setActiveDispatch] = useState<CyberDispatch | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('technical');
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // AI Beginner Threat Learning state (per dispatch ID)
  const [aiGuidesById, setAiGuidesById] = useState<Record<string, BeginnerThreatGuide>>({});
  const [aiLoadingById, setAiLoadingById] = useState<Record<string, boolean>>({});
  const [aiErrorById, setAiErrorById] = useState<Record<string, string>>({});
  const [inlineExpandedAiIds, setInlineExpandedAiIds] = useState<Record<string, boolean>>({});
  const [selectedQuizAnswerById, setSelectedQuizAnswerById] = useState<Record<string, number>>({});

  // Follow-up Beginner Q&A state per dispatch ID
  const [qaHistoryById, setQaHistoryById] = useState<Record<string, QaExchange[]>>({});
  const [qaInputById, setQaInputById] = useState<Record<string, string>>({});
  const [qaLoadingById, setQaLoadingById] = useState<Record<string, boolean>>({});
  const [qaErrorById, setQaErrorById] = useState<Record<string, string>>({});

  // Custom RSS source form state
  const [newSourceName, setNewSourceName] = useState<string>('');
  const [newSourceUrl, setNewSourceUrl] = useState<string>('');
  const [newSourceType, setNewSourceType] = useState<NewsSourceConfig['publisherType']>(
    'Independent Journalism'
  );
  const [isAddingSource, setIsAddingSource] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Persist Read Later list to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(READ_LATER_STORAGE_KEY, JSON.stringify(savedArticles));
    } catch {
      // ignore storage errors
    }
  }, [savedArticles]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2800);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Keyboard shortcut '/' to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && activeDispatch) {
        setActiveDispatch(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDispatch]);

  // Fetch AI Beginner Threat Explanation from Server-Side Gemini API
  const fetchAiBeginnerGuide = useCallback(
    async (dispatch: CyberDispatch, forceRegenerate = false) => {
      if (!forceRegenerate && aiGuidesById[dispatch.id]) {
        return;
      }

      setAiLoadingById((prev) => ({ ...prev, [dispatch.id]: true }));
      setAiErrorById((prev) => {
        const next = { ...prev };
        delete next[dispatch.id];
        return next;
      });

      try {
        const res = await fetch('/api/ai/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          signal: AbortSignal.timeout(35000),
          body: JSON.stringify({ articleId: dispatch.id, forceRegenerate }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Could not generate beginner guide from Gemini API.');
        }

        if (data.guide) {
          setAiGuidesById((prev) => ({ ...prev, [dispatch.id]: data.guide }));
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to reach the Gemini AI service. Check Settings > Secrets for your API key.';
        setAiErrorById((prev) => ({ ...prev, [dispatch.id]: msg }));
      } finally {
        setAiLoadingById((prev) => ({ ...prev, [dispatch.id]: false }));
      }
    },
    [aiGuidesById, ownerToken]
  );

  // Open article drawer directly in Beginner Learning Mode
  const openBeginnerLearningDrawer = (dispatch: CyberDispatch, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveDispatch(dispatch);
    setDrawerTab('beginner-ai');
    fetchAiBeginnerGuide(dispatch, false);
  };

  // Toggle inline AI Beginner card directly inside the feed
  const toggleInlineAiCard = (dispatch: CyberDispatch, e: React.MouseEvent) => {
    e.stopPropagation();
    const isCurrentlyOpen = Boolean(inlineExpandedAiIds[dispatch.id]);
    setInlineExpandedAiIds((prev) => ({
      ...prev,
      [dispatch.id]: !isCurrentlyOpen,
    }));
    if (!isCurrentlyOpen) {
      fetchAiBeginnerGuide(dispatch, false);
    }
  };

  // Ask follow-up question to the AI Threat Tutor
  const handleAskFollowUp = async (
    dispatch: CyberDispatch,
    customQuestion?: string,
    e?: React.FormEvent
  ) => {
    if (e) e.preventDefault();
    const questionText = (customQuestion ?? qaInputById[dispatch.id] ?? '').trim();
    if (!questionText) return;

    if (!customQuestion) {
      setQaInputById((prev) => ({ ...prev, [dispatch.id]: '' }));
    }

    setQaLoadingById((prev) => ({ ...prev, [dispatch.id]: true }));
    setQaErrorById((prev) => {
      const next = { ...prev };
      delete next[dispatch.id];
      return next;
    });

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          signal: AbortSignal.timeout(35000),
        body: JSON.stringify({ articleId: dispatch.id, question: questionText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get an answer from the AI tutor.');
      }

      setQaHistoryById((prev) => ({
        ...prev,
        [dispatch.id]: [
          ...(prev[dispatch.id] || []),
          { question: questionText, answer: data.answer },
        ],
      }));
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to answer question right now.';
      setQaErrorById((prev) => ({ ...prev, [dispatch.id]: msg }));
    } finally {
      setQaLoadingById((prev) => ({ ...prev, [dispatch.id]: false }));
    }
  };

  // Preserve the last good feed on errors; share overlapping refresh requests.
  const syncLiveFeed = useCallback(async (_force = false, silent = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (!silent) setIsSyncing(true);
    try {
      const response = await fetch('/api/feed', { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('Feed refresh failed. Previous articles are still available.');
      const data = await response.json();
      if (!Array.isArray(data.dispatches) || !Array.isArray(data.sources)) throw new Error('Invalid feed response.');
      setDispatches(data.dispatches);
      setSources(data.sources);
      if (data.syncedAt) setLastSyncedAt(data.syncedAt);
      const failures = data.sources.filter((source: NewsSourceConfig) => source.status === 'Error' || source.status === 'Stale');
      setFeedError(failures.length ? `${failures.length} feed(s) could not refresh. Check Sources for details; previous articles are retained.` : '');
      if (!silent && !failures.length) showToast('Feed refreshed (server cache may be up to 45 seconds old).');
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Feed refresh failed.');
    } finally { syncingRef.current = false; setIsSyncing(false); }
  }, [showToast]);

  useEffect(() => {
    syncLiveFeed(false, false);
  }, [syncLiveFeed]);

  // Real-time polling interval
  useEffect(() => {
    if (!autoPollEnabled) return;
    const interval = setInterval(() => {
      syncLiveFeed(false, true);
    }, 30_000);
    return () => clearInterval(interval);
  }, [autoPollEnabled, syncLiveFeed]);

  // Check if an article is saved in Read Later
  const savedIdsSet = useMemo(() => new Set(savedArticles.map((a) => a.id)), [savedArticles]);

  const toggleReadLater = useCallback(
    (dispatch: CyberDispatch, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setSavedArticles((prev) => {
        const exists = prev.some((item) => item.id === dispatch.id);
        if (exists) {
          showToast(`Removed from Read Later: "${dispatch.title.slice(0, 44)}..."`);
          return prev.filter((item) => item.id !== dispatch.id);
        } else {
          showToast(`Saved to Read Later (${prev.length + 1} in queue)`);
          return [dispatch, ...prev];
        }
      });
    },
    [showToast]
  );

  // Demo stories are a separate, explicitly labeled view.
  const toggleSourceEnabled = (sourceId: string) => {
    setMutedSourceIds(prev => prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]);
  };

  const enabledSourceIds = useMemo(() => {
    return new Set(sources.filter((s) => s.enabled).map((s) => s.id));
  }, [sources]);

  // Category counts for the category bar
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0 };
    for (const cat of Object.values(DispatchCategory)) {
      counts[cat] = 0;
    }
    for (const d of dispatches) {
      if (!enabledSourceIds.has(d.sourceId)) continue;
      counts.ALL = (counts.ALL || 0) + 1;
      counts[d.category] = (counts[d.category] || 0) + 1;
    }
    return counts;
  }, [dispatches, enabledSourceIds]);

  // Efficient, dynamic real-time feed filtering
  const filteredDispatches = useMemo(() => {
    const tokens = searchQuery
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return dispatches.filter((item) => {
      if (!enabledSourceIds.has(item.sourceId)) return false;

      if (activeSection === 'vulnerabilities') {
        if (!item.cveId && item.category !== DispatchCategory.ZERO_DAY) return false;
      } else if (activeSection === 'advisories') {
        if (
          item.category !== DispatchCategory.ADVISORY &&
          item.category !== DispatchCategory.POLICY &&
          item.sourceId !== 'cisa-kev'
        ) {
          return false;
        }
      }

      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      if (selectedSeverity !== 'ALL' && item.severity !== selectedSeverity) {
        return false;
      }

      if (selectedSourceId !== 'ALL' && item.sourceId !== selectedSourceId) {
        return false;
      }

      if (onlyExploitedKev && !item.activelyExploited) {
        return false;
      }

      if (tokens.length > 0) {
        const searchableCorpus = [
          item.title,
          item.summary,
          item.sourceName,
          item.author,
          item.category,
          item.severity,
          item.cveId || '',
          ...(item.leadBody || []),
          ...(item.iocs?.map((i) => `${i.type} ${i.value} ${i.context}`) || []),
        ]
          .join(' ')
          .toLowerCase();

        for (const token of tokens) {
          if (!searchableCorpus.includes(token)) return false;
        }
      }

      return true;
    });
  }, [
    dispatches,
    enabledSourceIds,
    activeSection,
    selectedCategory,
    selectedSeverity,
    selectedSourceId,
    onlyExploitedKev,
    searchQuery,
  ]);

  // Filtered Read Later queue
  const filteredSavedArticles = useMemo(() => {
    const q = readLaterSearch.toLowerCase().trim();
    return savedArticles.filter((item) => {
      if (readLaterCategory !== 'ALL' && item.category !== readLaterCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        (item.cveId && item.cveId.toLowerCase().includes(q)) ||
        item.sourceName.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [savedArticles, readLaterSearch, readLaterCategory]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCategory !== 'ALL' ||
    selectedSeverity !== 'ALL' ||
    selectedSourceId !== 'ALL' ||
    onlyExploitedKev;

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSelectedSeverity('ALL');
    setSelectedSourceId('ALL');
    setOnlyExploitedKev(false);
  };

  // Add custom RSS source handler
  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    setIsAddingSource(true);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          signal: AbortSignal.timeout(35000),
        body: JSON.stringify({
          name: newSourceName.trim(),
          feedUrl: newSourceUrl.trim(),
          siteUrl: newSourceUrl.trim(),
          publisherType: newSourceType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add this source.');
      if (Array.isArray(data.sources)) setSources(data.sources);
      setNewSourceName('');
      setNewSourceUrl('');
      showToast('Source saved. It will be checked on the next scheduled feed refresh.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not add this source.');
    } finally {
      setIsAddingSource(false);
    }
  };

  // Export current view or Read Later list as JSON
  const handleExportBrief = (itemsToExport: CyberDispatch[], filenamePrefix: string) => {
    const payload = {
      generatedBy: 'Sentinel Wire Threat Intelligence Aggregator',
      exportedAt: new Date().toISOString(),
      count: itemsToExport.length,
      dispatches: itemsToExport,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${itemsToExport.length} dispatches to JSON`);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedValue(text);
    setTimeout(() => setCopiedValue(null), 1800);
  };

  // Render the AI Beginner Learning Guide Panel (reusable inline in feed or inside drawer)
  const renderBeginnerAiPanel = (dispatch: CyberDispatch, compact = false) => {
    const guide = aiGuidesById[dispatch.id];
    const isLoading = Boolean(aiLoadingById[dispatch.id]);
    const errorMsg = aiErrorById[dispatch.id];
    const selectedQuizIdx = selectedQuizAnswerById[dispatch.id];
    const qaList = qaHistoryById[dispatch.id] || [];
    const qaInput = qaInputById[dispatch.id] || '';
    const isQaLoading = Boolean(qaLoadingById[dispatch.id]);
    const qaError = qaErrorById[dispatch.id];

    const suggestedQuestions = [
      'Does this threat affect regular home users or mainly companies?',
      'How would a beginner spot or prevent this type of attack?',
      `What does "${dispatch.category}" mean in simple terms?`,
    ];

    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${
          compact
            ? 'mt-4 p-5 bg-stone-100/90 dark:bg-slate-900/90 border border-stone-200 dark:border-slate-800 rounded-lg'
            : 'mt-6 space-y-6'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <h4 className="font-serif text-base font-semibold text-stone-900 dark:text-slate-100">
              AI Beginner Threat Guide — Learn This Threat
            </h4>
          </div>
          <div className="flex items-center gap-2">
            {guide && (
              <button
                type="button"
                onClick={() => fetchAiBeginnerGuide(dispatch, true)}
                disabled={isLoading}
                className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-400 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Regenerate Explanation</span>
              </button>
            )}
            {compact && (
              <button
                type="button"
                onClick={(e) => openBeginnerLearningDrawer(dispatch, e)}
                className="text-xs font-semibold text-amber-800 dark:text-amber-400 hover:underline cursor-pointer ml-2"
              >
                Open Full Interactive Tutor
              </button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2.5">
            <Loader2 className="w-6 h-6 animate-spin text-amber-700 dark:text-amber-400" />
            <p className="text-sm font-medium text-stone-700 dark:text-slate-300">
              Translating technical threat intelligence into a beginner-friendly guide...
            </p>
            <p className="text-xs text-stone-500 dark:text-slate-400">
              Generating plain-English summary, real-world analogy, attack steps &amp; jargon decoder
            </p>
          </div>
        )}

        {errorMsg && !isLoading && (
          <div className="p-4 my-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
              <span className="font-semibold">AI Explainer Notice:</span> {errorMsg}
            </div>
            <button
              type="button"
              onClick={() => fetchAiBeginnerGuide(dispatch, true)}
              className="px-3 py-1.5 text-xs font-semibold bg-red-700 text-white rounded-md hover:bg-red-800 shrink-0 cursor-pointer"
            >
              Retry AI Guide
            </button>
          </div>
        )}

        {guide && !isLoading && (
          <div className="space-y-5 pt-3">
            {/* 1. Plain-English Summary & Real-World Analogy */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
                <div className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-slate-400">
                  01. What Happened (In Plain English)
                </div>
                <p className="text-sm text-stone-800 dark:text-slate-200 mt-2 leading-relaxed">
                  {guide.plainEnglishSummary}
                </p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
                <div className="text-xs font-mono uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  02. Everyday Analogy
                </div>
                <p className="text-sm text-stone-800 dark:text-slate-200 mt-2 leading-relaxed">
                  {guide.realWorldAnalogy}
                </p>
              </div>
            </div>

            {/* 2. How the Attack Works Step-by-Step */}
            <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
              <div className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-slate-400 mb-3">
                03. Step-by-Step: How This Threat Works
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {guide.attackSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#FBF9F5] dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800 rounded"
                  >
                    <div className="text-xs font-mono font-semibold text-amber-800 dark:text-amber-400 tabular-nums">
                      Step 0{idx + 1}
                    </div>
                    <p className="text-xs text-stone-700 dark:text-slate-300 mt-1 leading-relaxed">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Why It Matters & Personal Protection Takeaway */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
                <div className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-slate-400">
                  04. Why Should Beginners Care?
                </div>
                <p className="text-xs sm:text-sm text-stone-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                  {guide.whyItMatters}
                </p>
              </div>

              <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
                <div className="text-xs font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  05. Key Defensive Habit to Learn
                </div>
                <p className="text-xs sm:text-sm text-stone-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                  {guide.personalProtectionTip}
                </p>
              </div>
            </div>

            {/* 4. Jargon Decoder (Glossary) */}
            {guide.jargonDecoder && guide.jargonDecoder.length > 0 && (
              <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
                <div className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-slate-400 mb-3">
                  06. Cybersecurity Jargon Decoder
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {guide.jargonDecoder.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#FBF9F5] dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800 rounded"
                    >
                      <dt className="text-xs font-mono font-semibold text-stone-900 dark:text-amber-300">
                        {item.term}
                      </dt>
                      <dd className="text-xs text-stone-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {item.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* 5. Quick 1-Question Knowledge Check Quiz */}
            {guide.quiz && (
              <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
                <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-slate-400">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                  <span>07. Quick Knowledge Check</span>
                </div>
                <p className="text-sm font-semibold text-stone-900 dark:text-slate-100 mt-2">
                  {guide.quiz.question}
                </p>
                <div className="mt-3 space-y-2">
                  {guide.quiz.options.map((opt, idx) => {
                    const isSelected = selectedQuizIdx === idx;
                    const isCorrect = idx === guide.quiz.correctIndex;
                    const showResult = selectedQuizIdx !== undefined;

                    let buttonStyle =
                      'bg-[#FBF9F5] dark:bg-slate-900 border-stone-200 dark:border-slate-800 text-stone-800 dark:text-slate-200 hover:border-stone-400';
                    if (showResult) {
                      if (isCorrect) {
                        buttonStyle =
                          'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-600 text-emerald-900 dark:text-emerald-200 font-medium';
                      } else if (isSelected && !isCorrect) {
                        buttonStyle =
                          'bg-red-50 dark:bg-red-950/50 border-red-500 text-red-900 dark:text-red-200';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setSelectedQuizAnswerById((prev) => ({
                            ...prev,
                            [dispatch.id]: idx,
                          }))
                        }
                        className={`w-full text-left px-3.5 py-2.5 text-xs rounded border transition-colors cursor-pointer flex items-center justify-between gap-2 ${buttonStyle}`}
                      >
                        <span>{opt}</span>
                        {showResult && isCorrect && (
                          <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 shrink-0">
                            Correct
                          </span>
                        )}
                        {showResult && isSelected && !isCorrect && (
                          <span className="font-mono text-[11px] text-red-700 dark:text-red-400 shrink-0">
                            Try again
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedQuizIdx !== undefined && (
                  <p className="text-xs text-stone-600 dark:text-slate-300 mt-3 pt-2.5 border-t border-stone-200 dark:border-slate-800 leading-relaxed">
                    <span className="font-semibold text-stone-900 dark:text-slate-100">
                      Why:
                    </span>{' '}
                    {guide.quiz.explanation}
                  </p>
                )}
              </div>
            )}

            {/* 6. Interactive Beginner Q&A Tutor */}
            <div className="p-4 bg-white dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md">
              <div className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-slate-400">
                <MessageSquare className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                <span>08. Ask the AI Threat Mentor a Question</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={isQaLoading}
                    onClick={() => handleAskFollowUp(dispatch, q)}
                    className="text-left px-2.5 py-1 text-xs bg-stone-100 hover:bg-stone-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-stone-700 dark:text-slate-300 border border-stone-200 dark:border-slate-800 rounded transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {qaList.length > 0 && (
                <div className="mt-3 space-y-2.5 border-t border-stone-200 dark:border-slate-800 pt-3">
                  {qaList.map((exchange, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#FBF9F5] dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800 rounded text-xs space-y-1.5"
                    >
                      <div className="font-semibold text-stone-900 dark:text-slate-100">
                        Q: {exchange.question}
                      </div>
                      <div className="text-stone-700 dark:text-slate-300 leading-relaxed">
                        {exchange.answer}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {qaError && (
                <p className="text-xs text-red-700 dark:text-red-400 mt-2">{qaError}</p>
              )}

              <form
                onSubmit={(e) => handleAskFollowUp(dispatch, undefined, e)}
                className="mt-3 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={qaInput}
                  onChange={(e) =>
                    setQaInputById((prev) => ({ ...prev, [dispatch.id]: e.target.value }))
                  }
                  maxLength={1000}
                  placeholder="Ask anything about this threat in plain English..."
                  className="flex-1 px-3 py-2 text-xs bg-[#FBF9F5] dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md text-stone-900 dark:text-slate-100 placeholder:text-stone-400 focus:outline-none focus:border-stone-500"
                />
                <button
                  type="submit"
                  disabled={isQaLoading || !qaInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-50 bg-stone-900 hover:bg-stone-800 dark:bg-amber-500 dark:text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isQaLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Ask Mentor</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Determine 3-tier front-page items when viewing full feed without narrow search
  const showEditorialThreeTier =
    activeSection === 'feed' && !hasActiveFilters && filteredDispatches.length >= 4;

  const leadStory = showEditorialThreeTier ? filteredDispatches[0] : null;
  const secondaryFeatures = showEditorialThreeTier ? filteredDispatches.slice(1, 3) : [];
  const wireDispatches = showEditorialThreeTier
    ? filteredDispatches.slice(3)
    : filteredDispatches;

  const totalReadLaterMinutes = useMemo(
    () => savedArticles.reduce((acc, item) => acc + (item.readingTimeMinutes || 4), 0),
    [savedArticles]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] dark:bg-slate-950 text-stone-900 dark:text-slate-100 transition-colors duration-150">
      <section className="px-6 py-3 text-sm border-b border-stone-300 dark:border-slate-700" aria-label="Feed status and owner access">
        <p>Live article severity, CVSS and exploitation status are unknown unless verified. Categories are keyword suggestions.</p>
        {showDemo && <p className="font-semibold text-amber-800 dark:text-amber-300">DEMO MODE — fictional examples for learning, not verified reporting or actionable advisories.</p>}
        {feedError && <p role="alert" className="text-red-700 dark:text-red-400">{feedError}</p>}
        <details className="mt-2">
          <summary className="cursor-pointer">Owner access — AI and source management</summary>
          <label className="block mt-2">Access token
            <input type="password" value={ownerToken} onChange={e => setOwnerToken(e.target.value)} autoComplete="off" maxLength={256} className="ml-2 p-2 border rounded bg-white dark:bg-slate-900" />
          </label>
          <p className="mt-1">The token stays in this tab's memory. Only enter it on your own trusted HTTPS site or localhost.</p>
          <button type="button" onClick={() => setOwnerToken('')} className="underline">Clear token</button>
          {!aiEnabled && <p>AI is unavailable until the server has a valid API key and model configured.</p>}
        </details>
      </section>
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#FBF9F5]/95 dark:bg-slate-950/95 backdrop-blur-xs border-b border-stone-200 dark:border-slate-800">
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Brand Wordmark (single text element, one line) */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('feed');
            }}
            className="font-serif text-xl font-semibold tracking-tight text-stone-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            Sentinel Wire
          </a>

          {/* Zone 2: 5 concise single-line text navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600 dark:text-slate-400"
          >
            <button
              type="button"
              onClick={() => setActiveSection('feed')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'feed'
                  ? 'border-stone-900 dark:border-amber-400 text-stone-950 dark:text-white font-semibold'
                  : 'border-transparent hover:text-stone-900 dark:hover:text-slate-200'
              }`}
            >
              Live Feed
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('vulnerabilities')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'vulnerabilities'
                  ? 'border-stone-900 dark:border-amber-400 text-stone-950 dark:text-white font-semibold'
                  : 'border-transparent hover:text-stone-900 dark:hover:text-slate-200'
              }`}
            >
              Vulnerabilities
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('advisories')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'advisories'
                  ? 'border-stone-900 dark:border-amber-400 text-stone-950 dark:text-white font-semibold'
                  : 'border-transparent hover:text-stone-900 dark:hover:text-slate-200'
              }`}
            >
              Advisories
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('sources')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'sources'
                  ? 'border-stone-900 dark:border-amber-400 text-stone-950 dark:text-white font-semibold'
                  : 'border-transparent hover:text-stone-900 dark:hover:text-slate-200'
              }`}
            >
              Sources
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('read-later')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === 'read-later'
                  ? 'border-stone-900 dark:border-amber-400 text-stone-950 dark:text-white font-semibold'
                  : 'border-transparent hover:text-stone-900 dark:hover:text-slate-200'
              }`}
            >
              Read Later ({savedArticles.length})
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => syncLiveFeed(true, false)}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-stone-50 bg-stone-900 hover:bg-stone-800 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Wire...' : 'Sync Live Wire'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden border-b border-stone-200 dark:border-slate-800 bg-[#FBF9F5] dark:bg-slate-950 px-4 py-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {(
            [
              ['feed', 'Live Feed'],
              ['vulnerabilities', 'Vulnerabilities'],
              ['advisories', 'Advisories'],
              ['sources', 'Sources'],
              ['read-later', `Read Later (${savedArticles.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSection(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeSection === key
                  ? 'bg-stone-900 text-stone-50 dark:bg-amber-500 dark:text-slate-950'
                  : 'text-stone-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8">
        {/* Editorial Masthead & Operational Utility Strip */}
        <section className="pb-6 border-b border-stone-200 dark:border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-stone-500 dark:text-slate-400 tabular-nums">
                LAST SUCCESSFUL SOURCE UPDATE · {formatUtcClock(lastSyncedAt)}
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-stone-900 dark:text-slate-50 mt-1.5">
                {activeSection === 'read-later'
                  ? 'Saved Dispatches & Reading Queue'
                  : activeSection === 'sources'
                  ? 'Syndicated Threat Intelligence Feeds'
                  : activeSection === 'vulnerabilities'
                  ? 'Zero-Day Exploits & CVE Telemetry'
                  : activeSection === 'advisories'
                  ? 'CISA Directives & Vendor Advisories'
                  : 'Global Cybersecurity Dispatch'}
              </h1>
            </div>

            {/* Operational Utility Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowDemo(v => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 bg-stone-200/70 hover:bg-stone-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-stone-300/80 dark:border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                <span>{showDemo ? 'Show live news' : 'View demo stories'}</span>
              </button>

              <button
                type="button"
                onClick={() => setAutoPollEnabled((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono text-stone-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md hover:border-stone-300 dark:hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
              >
                <span>Auto-Refresh: {autoPollEnabled ? '30s Active' : 'Paused'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveSection(activeSection === 'read-later' ? 'feed' : 'read-later')
                }
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  activeSection === 'read-later'
                    ? 'bg-stone-900 text-stone-50 border-stone-900 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
                    : 'bg-white dark:bg-slate-900 text-stone-800 dark:text-slate-200 border-stone-200 dark:border-slate-800 hover:border-stone-300'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Read Later ({savedArticles.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                aria-label="Toggle color theme"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md hover:border-stone-300 dark:hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{darkMode ? 'Light Paper' : 'Dark Slate'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* =====================================================================
            VIEW 1: DEDICATED 'READ LATER' SAVED ARTICLES SECTION
           ===================================================================== */}
        {activeSection === 'read-later' && (
          <section className="py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-slate-800">
              <div>
                <p className="text-sm text-stone-600 dark:text-slate-400">
                  Articles saved to your local browser queue for offline-ready review and AI
                  beginner study—no account or sign-in required.
                </p>
                <p className="text-xs font-mono text-stone-500 dark:text-slate-400 mt-1 tabular-nums">
                  {savedArticles.length} saved{' '}
                  {savedArticles.length === 1 ? 'dispatch' : 'dispatches'} · Estimated{' '}
                  {totalReadLaterMinutes} min total reading time
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSection('feed')}
                  className="px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md hover:border-stone-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Back to Live Feed
                </button>
                {savedArticles.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleExportBrief(savedArticles, 'sentinel-read-later')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md hover:border-stone-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Queue (JSON)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSavedArticles([]);
                        showToast('Cleared Read Later reading queue');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md hover:border-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Queue</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Filter controls inside Read Later */}
            {savedArticles.length > 0 && (
              <div className="py-5 border-b border-stone-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={readLaterSearch}
                    onChange={(e) => setReadLaterSearch(e.target.value)}
                    placeholder="Filter saved articles by keyword, CVE, or source..."
                    className="w-full pl-10 pr-8 py-2 text-sm bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md text-stone-900 dark:text-slate-100 placeholder:text-stone-400 focus:outline-none focus:border-stone-500 dark:focus:border-amber-400"
                  />
                  {readLaterSearch && (
                    <button
                      type="button"
                      onClick={() => setReadLaterSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setReadLaterCategory('ALL')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      readLaterCategory === 'ALL'
                        ? 'bg-stone-900 text-stone-50 dark:bg-amber-500 dark:text-slate-950'
                        : 'text-stone-600 dark:text-slate-400 hover:text-stone-900'
                    }`}
                  >
                    All Saved ({savedArticles.length})
                  </button>
                  {Object.values(DispatchCategory).map((category) => {
                    const count = savedArticles.filter((a) => a.category === category).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setReadLaterCategory(category)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          readLaterCategory === category
                            ? 'bg-stone-900 text-stone-50 dark:bg-amber-500 dark:text-slate-950'
                            : 'text-stone-600 dark:text-slate-400 hover:text-stone-900'
                        }`}
                      >
                        {category} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Saved Articles List or Empty State */}
            {savedArticles.length === 0 ? (
              <div className="py-16 text-center max-w-md mx-auto">
                <Bookmark className="w-8 h-8 text-stone-400 dark:text-slate-600 mx-auto mb-3" />
                <h2 className="font-serif text-xl font-semibold text-stone-900 dark:text-slate-100">
                  Your Read Later Queue is Empty
                </h2>
                <p className="text-sm text-stone-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Click the &ldquo;Read Later&rdquo; button on any cybersecurity dispatch or CVE
                  advisory in the live feed to bookmark it here for deep-dive technical review.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection('feed')}
                  className="mt-6 px-4 py-2 text-xs font-semibold text-stone-50 bg-stone-900 hover:bg-stone-800 dark:bg-amber-500 dark:text-slate-950 rounded-md transition-colors cursor-pointer"
                >
                  Browse Live Security Wire
                </button>
              </div>
            ) : filteredSavedArticles.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-stone-600 dark:text-slate-400">
                  No saved articles match your filter &ldquo;{readLaterSearch}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setReadLaterSearch('');
                    setReadLaterCategory('ALL');
                  }}
                  className="mt-3 text-xs font-semibold underline text-stone-900 dark:text-amber-400 cursor-pointer"
                >
                  Reset Saved Queue Filters
                </button>
              </div>
            ) : (
              <div className="divide-y divide-stone-200 dark:divide-slate-800">
                {filteredSavedArticles.map((article) => {
                  const isInlineOpen = Boolean(inlineExpandedAiIds[article.id]);
                  return (
                    <article
                      key={article.id}
                      onClick={() => {
                        setActiveDispatch(article);
                        setDrawerTab('technical');
                      }}
                      className="py-6 group cursor-pointer hover:bg-stone-100/60 dark:hover:bg-slate-900/40 -mx-4 px-4 rounded-lg transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                        <div className="flex-1 max-w-3xl">
                          {/* Zero-Pill Metadata Line */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-slate-400 tabular-nums">
                            <span className="font-medium text-stone-800 dark:text-slate-200">
                              {article.sourceName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{article.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className={getSeverityTextStyle(article.severity)}>
                              {article.severity}
                              {article.cvssScore ? ` (CVSS ${article.cvssScore.toFixed(1)})` : ''}
                            </span>
                            {article.cveId && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono font-medium text-stone-800 dark:text-slate-200">
                                  {article.cveId}
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              {formatRelativeTime(article.publishedAt)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{article.readingTimeMinutes} min read</span>
                          </div>

                          <h2 className="font-serif text-xl font-semibold text-stone-900 dark:text-slate-100 group-hover:text-amber-900 dark:group-hover:text-amber-400 transition-colors mt-2">
                            {article.title}
                          </h2>

                          <p className="text-sm text-stone-600 dark:text-slate-300 mt-2 leading-relaxed">
                            {article.summary}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 lg:pt-6">
                          <button
                            type="button"
                            onClick={(e) => toggleInlineAiCard(article, e)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isInlineOpen
                                ? 'bg-amber-800 text-white border-amber-800 dark:bg-amber-400 dark:text-slate-950 dark:border-amber-400'
                                : 'bg-stone-200/80 dark:bg-slate-800 text-stone-900 dark:text-amber-300 border-stone-300 dark:border-slate-700 hover:bg-stone-300/70'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{isInlineOpen ? 'Hide Beginner Guide' : 'Explain for Beginners'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDispatch(article);
                              setDrawerTab('technical');
                            }}
                            className="px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md hover:border-stone-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Read Dispatch
                          </button>

                          <button
                            type="button"
                            onClick={(e) => toggleReadLater(article, e)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md hover:border-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      {isInlineOpen && renderBeginnerAiPanel(article, true)}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* =====================================================================
            VIEW 2: SYNDICATED SOURCES DIRECTORY & CUSTOM RSS CONNECTOR
           ===================================================================== */}
        {activeSection === 'sources' && (
          <section className="py-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8">
              <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-slate-800">
                <h2 className="font-serif text-xl font-semibold text-stone-900 dark:text-slate-100">
                  Configured Intelligence &amp; Media Feeds
                </h2>
                <span className="text-xs font-mono text-stone-500 dark:text-slate-400 tabular-nums">
                  {sources.filter((s) => s.enabled).length} of {sources.length} feeds active
                </span>
              </div>

              <div className="divide-y divide-stone-200 dark:divide-slate-800">
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-slate-400 tabular-nums">
                        <span className="font-medium text-stone-700 dark:text-slate-300">
                          {source.publisherType}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{source.articleCount} dispatches indexed</span>
                        <span aria-hidden="true">·</span>
                        <span>{source.status} · Last success: {formatRelativeTime(source.lastSyncedAt)}</span>
                        {source.error && <span className="text-red-700 dark:text-red-400">{source.error}</span>}
                      </div>
                      <h3 className="text-base font-semibold text-stone-900 dark:text-slate-100 mt-1">
                        {source.name}
                      </h3>
                      <p className="text-xs font-mono text-stone-500 dark:text-slate-400 mt-1 truncate max-w-xl">
                        {source.feedUrl}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <a
                        href={source.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-100 border border-stone-200 dark:border-slate-800 rounded-md whitespace-nowrap shrink-0"
                      >
                        <span>Publisher</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => toggleSourceEnabled(source.id)}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          source.enabled
                            ? 'bg-stone-900 text-stone-50 dark:bg-amber-500 dark:text-slate-950'
                            : 'bg-stone-200 text-stone-700 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {source.enabled ? 'Enabled in Wire' : 'Muted'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Custom RSS/Atom Feed Form */}
            <aside className="lg:col-span-4">
              <div className="p-6 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-lg">
                <div className="flex items-center gap-2 text-stone-900 dark:text-slate-100 font-serif text-lg font-semibold">
                  <Rss className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <h2>Connect Custom RSS / Atom Feed</h2>
                </div>
                <p className="text-xs text-stone-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Add any security vendor blog, CERT advisory XML, or threat research RSS endpoint
                  to ingest live articles into the real-time feed.
                </p>

                <form onSubmit={handleAddSource} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 dark:text-slate-300 mb-1.5">
                      Publication or CERT Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      placeholder="e.g., Dark Reading or US-CERT XML"
                      className="w-full px-3 py-2 text-sm bg-[#FBF9F5] dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md text-stone-900 dark:text-slate-100 focus:outline-none focus:border-stone-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 dark:text-slate-300 mb-1.5">
                      RSS / Atom Feed URL
                    </label>
                    <input
                      type="url"
                      required
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      placeholder="https://www.darkreading.com/rss.xml"
                      className="w-full px-3 py-2 text-sm font-mono bg-[#FBF9F5] dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md text-stone-900 dark:text-slate-100 focus:outline-none focus:border-stone-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 dark:text-slate-300 mb-1.5">
                      Source Classification
                    </label>
                    <select
                      value={newSourceType}
                      onChange={(e) =>
                        setNewSourceType(e.target.value as NewsSourceConfig['publisherType'])
                      }
                      className="w-full px-3 py-2 text-sm bg-[#FBF9F5] dark:bg-slate-950 border border-stone-200 dark:border-slate-800 rounded-md text-stone-900 dark:text-slate-100 focus:outline-none focus:border-stone-500"
                    >
                      <option value="Independent Journalism">Independent Journalism</option>
                      <option value="Threat Intelligence Lab">Threat Intelligence Lab</option>
                      <option value="Government Advisory">Government Advisory</option>
                      <option value="Community Feed">Community Feed</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingSource}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-stone-50 bg-stone-900 hover:bg-stone-800 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isAddingSource ? 'Connecting & Parsing XML...' : 'Connect Feed to Wire'}
                  </button>
                </form>
              </div>
            </aside>
          </section>
        )}

        {/* =====================================================================
            VIEW 3: REAL-TIME FEED, FILTERING & CATEGORIZATION WORKSPACE
           ===================================================================== */}
        {(activeSection === 'feed' ||
          activeSection === 'vulnerabilities' ||
          activeSection === 'advisories') && (
          <>
            {/* Real-Time Filtering & Categorization Bar */}
            <section
              aria-label="News Filtering and Categorization System"
              className="py-5 border-b border-stone-200 dark:border-slate-800 space-y-4"
            >
              {/* Row 1: Keyword Search + Precision Dropdowns */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-stone-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter real-time wire by keyword, CVE ID (e.g. CVE-2026-41892), vendor, or IOC... (Press '/' to focus)"
                    className="w-full pl-10 pr-20 py-2.5 text-sm bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-stone-500 dark:focus:border-amber-400 transition-colors"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Clear
                    </button>
                  ) : (
                    <span className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-stone-400 dark:text-slate-500">
                      / to search
                    </span>
                  )}
                </div>

                {/* Precision Filter Controls: Severity, Publisher Source, KEV Toggle */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md px-3 py-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <label htmlFor="severity-select" className="text-xs text-stone-500 shrink-0">
                      Severity:
                    </label>
                    <select
                      id="severity-select"
                      value={selectedSeverity}
                      onChange={(e) => setSelectedSeverity(e.target.value)}
                      className="text-xs font-semibold bg-transparent text-stone-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All Levels</option>
                      <option value={SeverityLevel.CRITICAL}>Critical Only</option>
                      <option value={SeverityLevel.HIGH}>High Severity</option>
                      <option value={SeverityLevel.ELEVATED}>Elevated</option>
                      <option value={SeverityLevel.INFORMATIONAL}>Informational</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md px-3 py-2">
                    <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <label htmlFor="source-select" className="text-xs text-stone-500 shrink-0">
                      Source:
                    </label>
                    <select
                      id="source-select"
                      value={selectedSourceId}
                      onChange={(e) => setSelectedSourceId(e.target.value)}
                      className="text-xs font-semibold bg-transparent text-stone-900 dark:text-slate-100 focus:outline-none cursor-pointer max-w-[170px] truncate"
                    >
                      <option value="ALL">
                        All Active Feeds ({sources.filter((s) => s.enabled).length})
                      </option>
                      {sources
                        .filter((s) => s.enabled)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOnlyExploitedKev((v) => !v)}
                    className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      onlyExploitedKev
                        ? 'bg-red-700 text-white border-red-700 dark:bg-red-600 dark:border-red-600'
                        : 'bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-300 border-stone-200 dark:border-slate-800 hover:border-stone-300'
                    }`}
                  >
                    Actively Exploited (KEV)
                  </button>
                </div>
              </div>

              {/* Row 2: Interactive Category Segmented Bar + Quick Keyword Prompts */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Cybersecurity Categories"
                  className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedCategory === 'ALL'}
                    onClick={() => setSelectedCategory('ALL')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                      selectedCategory === 'ALL'
                        ? 'bg-stone-900 text-stone-50 dark:bg-amber-500 dark:text-slate-950 font-semibold'
                        : 'bg-stone-200/60 dark:bg-slate-900 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    All Categories ({categoryCounts.ALL || 0})
                  </button>

                  {Object.values(DispatchCategory).map((category) => (
                    <button
                      key={category}
                      type="button"
                      role="tab"
                      aria-selected={selectedCategory === category}
                      onClick={() =>
                        setSelectedCategory(selectedCategory === category ? 'ALL' : category)
                      }
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                        selectedCategory === category
                          ? 'bg-stone-900 text-stone-50 dark:bg-amber-500 dark:text-slate-950 font-semibold'
                          : 'bg-stone-200/60 dark:bg-slate-900 text-stone-700 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {category} ({categoryCounts[category] || 0})
                    </button>
                  ))}
                </div>

                {/* Quick Keyword Filter Shortcuts & Result Summary */}
                <div className="flex flex-wrap items-center justify-between xl:justify-end gap-3 text-xs text-stone-500 dark:text-slate-400">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <span className="text-stone-400 dark:text-slate-500 whitespace-nowrap">
                      Quick terms:
                    </span>
                    {['RCE', 'io_uring', 'BGP', 'SAML', 'PQC'].map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() =>
                          setSearchQuery((prev) =>
                            prev.toLowerCase() === term.toLowerCase() ? '' : term
                          )
                        }
                        className={`font-mono text-xs underline decoration-stone-300 dark:decoration-slate-700 underline-offset-4 hover:text-stone-900 dark:hover:text-amber-400 whitespace-nowrap shrink-0 cursor-pointer ${
                          searchQuery.toLowerCase() === term.toLowerCase()
                            ? 'text-stone-900 dark:text-amber-400 font-semibold'
                            : ''
                        }`}
                      >
                        {term}
                      </button>
                    ))}
                  </div>

                  <span className="font-mono tabular-nums text-stone-600 dark:text-slate-300 whitespace-nowrap">
                    Showing {filteredDispatches.length} of {categoryCounts.ALL || dispatches.length}{' '}
                    dispatches
                  </span>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs font-semibold text-amber-800 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Empty State when filters match 0 articles */}
            {filteredDispatches.length === 0 && (
              <section className="py-16 text-center max-w-md mx-auto">
                <h2 className="font-serif text-xl font-semibold text-stone-900 dark:text-slate-100">
                  No Matching Security Dispatches
                </h2>
                <p className="text-sm text-stone-600 dark:text-slate-400 mt-2 leading-relaxed">
                  No articles in the real-time feed matched your active combination of category,
                  severity, and keyword filters.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="mt-5 px-4 py-2 text-xs font-semibold text-stone-50 bg-stone-900 hover:bg-stone-800 dark:bg-amber-500 dark:text-slate-950 rounded-md transition-colors cursor-pointer"
                >
                  Clear All Active Filters
                </button>
              </section>
            )}

            {/* =================================================================
                3-TIER EDITORIAL FRONT PAGE (When viewing unfiltered Live Feed)
               ================================================================= */}
            {showEditorialThreeTier && leadStory && (
              <section className="py-8 border-b border-stone-200 dark:border-slate-800">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                  {/* Tier 1: Lead Story (7 columns) */}
                  <article
                    onClick={() => {
                      setActiveDispatch(leadStory);
                      setDrawerTab('technical');
                    }}
                    className="lg:col-span-7 flex flex-col justify-between lg:pr-8 lg:border-r border-stone-200 dark:border-slate-800 group cursor-pointer"
                  >
                    <div>
                      <ResilientEditorialImage
                        src={leadStory.imageUrl}
                        alt={leadStory.title}
                        caption={leadStory.imageCaption}
                        aspectClass="aspect-video"
                        category={leadStory.category}
                      />

                      {/* Zero-Pill Unboxed Metadata Line */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-slate-400 mt-5 tabular-nums">
                        <span className="font-semibold text-stone-800 dark:text-slate-200">
                          {leadStory.sourceName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{leadStory.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className={getSeverityTextStyle(leadStory.severity)}>
                          {leadStory.severity}
                          {leadStory.cvssScore ? ` (CVSS ${leadStory.cvssScore.toFixed(1)})` : ''}
                        </span>
                        {leadStory.cveId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-semibold text-stone-900 dark:text-slate-100">
                              {leadStory.cveId}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          {formatRelativeTime(leadStory.publishedAt)}
                        </span>
                      </div>

                      <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-slate-50 group-hover:text-amber-900 dark:group-hover:text-amber-400 transition-colors mt-2.5 leading-tight">
                        {leadStory.title}
                      </h2>

                      <p className="text-base text-stone-700 dark:text-slate-300 mt-3 leading-relaxed">
                        {leadStory.summary}
                      </p>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-4 pt-5 mt-6 border-t border-stone-200/80 dark:border-slate-800/80">
                        <span className="text-xs text-stone-500 dark:text-slate-400">
                          By {leadStory.author} · {leadStory.readingTimeMinutes} min read
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => toggleInlineAiCard(leadStory, e)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              inlineExpandedAiIds[leadStory.id]
                                ? 'bg-amber-800 text-white border-amber-800 dark:bg-amber-400 dark:text-slate-950 dark:border-amber-400'
                                : 'bg-stone-200/80 dark:bg-slate-800 text-stone-900 dark:text-amber-300 border-stone-300 dark:border-slate-700 hover:bg-stone-300/80'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>
                              {inlineExpandedAiIds[leadStory.id]
                                ? 'Hide Beginner Guide'
                                : 'Explain for Beginners (AI)'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => toggleReadLater(leadStory, e)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              savedIdsSet.has(leadStory.id)
                                ? 'bg-stone-900 text-stone-50 border-stone-900 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
                                : 'bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-300 border-stone-200 dark:border-slate-800 hover:border-stone-400'
                            }`}
                          >
                            {savedIdsSet.has(leadStory.id) ? (
                              <>
                                <BookmarkCheck className="w-3.5 h-3.5" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3.5 h-3.5" />
                                <span>Read Later</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDispatch(leadStory);
                              setDrawerTab('technical');
                            }}
                            className="px-3.5 py-1.5 text-xs font-semibold text-stone-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 hover:border-stone-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Full Brief
                          </button>
                        </div>
                      </div>

                      {inlineExpandedAiIds[leadStory.id] &&
                        renderBeginnerAiPanel(leadStory, true)}
                    </div>
                  </article>

                  {/* Tier 2: Secondary Feature Dispatches (5 columns) */}
                  <div className="lg:col-span-5 flex flex-col justify-between divide-y divide-stone-200 dark:divide-slate-800">
                    {secondaryFeatures.map((feature, idx) => (
                      <article
                        key={feature.id}
                        onClick={() => {
                          setActiveDispatch(feature);
                          setDrawerTab('technical');
                        }}
                        className={`${
                          idx === 0 ? 'pb-6' : 'pt-6'
                        } group cursor-pointer flex flex-col justify-between`}
                      >
                        <div>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                            <div className="sm:col-span-5">
                              <ResilientEditorialImage
                                src={feature.imageUrl}
                                alt={feature.title}
                                aspectClass="aspect-4/3"
                                category={feature.category}
                              />
                            </div>
                            <div className="sm:col-span-7">
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-stone-500 dark:text-slate-400 tabular-nums">
                                <span className="font-medium text-stone-800 dark:text-slate-200">
                                  {feature.sourceName}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className={getSeverityTextStyle(feature.severity)}>
                                  {feature.severity}
                                </span>
                                {feature.cveId && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono">{feature.cveId}</span>
                                  </>
                                )}
                              </div>

                              <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-slate-100 group-hover:text-amber-900 dark:group-hover:text-amber-400 transition-colors mt-1.5 leading-snug">
                                {feature.title}
                              </h3>
                            </div>
                          </div>

                          <p className="text-sm text-stone-600 dark:text-slate-300 mt-3 leading-relaxed line-clamp-2">
                            {feature.summary}
                          </p>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3">
                            <span className="text-xs font-mono text-stone-500 dark:text-slate-400 tabular-nums">
                              {formatRelativeTime(feature.publishedAt)} ·{' '}
                              {feature.readingTimeMinutes} min read
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => toggleInlineAiCard(feature, e)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  inlineExpandedAiIds[feature.id]
                                    ? 'bg-amber-800 text-white border-amber-800 dark:bg-amber-400 dark:text-slate-950 dark:border-amber-400'
                                    : 'bg-stone-200/80 dark:bg-slate-800 text-stone-900 dark:text-amber-300 border-stone-300 dark:border-slate-700 hover:bg-stone-300/80'
                                }`}
                              >
                                <BookOpen className="w-3 h-3" />
                                <span>
                                  {inlineExpandedAiIds[feature.id]
                                    ? 'Hide Guide'
                                    : 'Learn Threat (AI)'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => toggleReadLater(feature, e)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  savedIdsSet.has(feature.id)
                                    ? 'bg-stone-900 text-stone-50 border-stone-900 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
                                    : 'bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-300 border-stone-200 dark:border-slate-800 hover:border-stone-400'
                                }`}
                              >
                                {savedIdsSet.has(feature.id) ? (
                                  <>
                                    <BookmarkCheck className="w-3 h-3" />
                                    <span>Saved</span>
                                  </>
                                ) : (
                                  <>
                                    <Bookmark className="w-3 h-3" />
                                    <span>Read Later</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {inlineExpandedAiIds[feature.id] &&
                            renderBeginnerAiPanel(feature, true)}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* =================================================================
                TIER 3: CHRONOLOGICAL REAL-TIME SECURITY WIRE
               ================================================================= */}
            {wireDispatches.length > 0 && (
              <section className="py-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-stone-200 dark:border-slate-800">
                  <div>
                    <h2 className="font-serif text-xl font-semibold text-stone-900 dark:text-slate-100">
                      {hasActiveFilters
                        ? `Filtered Intelligence Stream (${wireDispatches.length})`
                        : 'Chronological Threat & Advisory Wire'}
                    </h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleExportBrief(filteredDispatches, 'sentinel-wire-feed')}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-100 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Current Feed (JSON)</span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-stone-200 dark:divide-slate-800">
                  {wireDispatches.map((item) => {
                    const isSaved = savedIdsSet.has(item.id);
                    const isInlineOpen = Boolean(inlineExpandedAiIds[item.id]);
                    return (
                      <article
                        key={item.id}
                        onClick={() => {
                          setActiveDispatch(item);
                          setDrawerTab('technical');
                        }}
                        className="py-5 group cursor-pointer hover:bg-stone-100/70 dark:hover:bg-slate-900/40 -mx-4 px-4 rounded-lg transition-colors"
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                          {/* Left Column: Tabular Timestamp + Severity & CVE */}
                          <div className="lg:col-span-2 flex lg:flex-col items-baseline lg:items-start gap-3 lg:gap-1 text-xs tabular-nums">
                            <span className="font-mono font-medium text-stone-800 dark:text-slate-200">
                              {formatRelativeTime(item.publishedAt)}
                            </span>
                            <span className={getSeverityTextStyle(item.severity)}>
                              {item.severity}
                              {item.cvssScore ? ` · CVSS ${item.cvssScore.toFixed(1)}` : ''}
                            </span>
                            {item.cveId && (
                              <span className="font-mono text-stone-600 dark:text-slate-400">
                                {item.cveId}
                              </span>
                            )}
                          </div>

                          {/* Center Column: Headline, Deck, and Unboxed Metadata */}
                          <div className="lg:col-span-7">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-slate-400">
                              <span className="font-semibold text-stone-800 dark:text-slate-200">
                                {item.sourceName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategory(item.category);
                                }}
                                className="hover:underline cursor-pointer"
                              >
                                {item.category}
                              </button>
                              <span aria-hidden="true">·</span>
                              <span>{item.author}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {item.readingTimeMinutes} min read
                              </span>
                              {item.activelyExploited && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-red-700 dark:text-red-400 font-semibold">
                                    Active Exploitation Confirmed
                                  </span>
                                </>
                              )}
                            </div>

                            <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-slate-100 group-hover:text-amber-900 dark:group-hover:text-amber-400 transition-colors mt-1.5 leading-snug">
                              {item.title}
                            </h3>

                            <p className="text-sm text-stone-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                              {item.summary}
                            </p>
                          </div>

                          {/* Right Column: AI Beginner Explain & Read Later Actions */}
                          <div className="lg:col-span-3 flex lg:justify-end items-center gap-2 shrink-0 pt-1">
                            <button
                              type="button"
                              onClick={(e) => toggleInlineAiCard(item, e)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isInlineOpen
                                  ? 'bg-amber-800 text-white border-amber-800 dark:bg-amber-400 dark:text-slate-950 dark:border-amber-400'
                                  : 'bg-stone-200/80 dark:bg-slate-800 text-stone-900 dark:text-amber-300 border-stone-300 dark:border-slate-700 hover:bg-stone-300/80'
                              }`}
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>{isInlineOpen ? 'Hide Guide' : 'Explain (AI)'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => toggleReadLater(item, e)}
                              aria-label={isSaved ? 'Remove from Read Later' : 'Save to Read Later'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isSaved
                                  ? 'bg-stone-900 text-stone-50 border-stone-900 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
                                  : 'bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-300 border-stone-200 dark:border-slate-800 hover:border-stone-400'
                              }`}
                            >
                              {isSaved ? (
                                <>
                                  <BookmarkCheck className="w-3.5 h-3.5" />
                                  <span>Saved</span>
                                </>
                              ) : (
                                <>
                                  <Bookmark className="w-3.5 h-3.5" />
                                  <span>Read Later</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {isInlineOpen && renderBeginnerAiPanel(item, true)}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* =====================================================================
          TECHNICAL & AI BEGINNER READER DRAWER
         ===================================================================== */}
      {activeDispatch && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-article-title"
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
          onClick={() => setActiveDispatch(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#FBF9F5] dark:bg-slate-950 text-stone-900 dark:text-slate-100 h-full overflow-y-auto border-l border-stone-200 dark:border-slate-800 shadow-2xl p-6 sm:p-10"
          >
            {/* Top Bar inside Drawer */}
            <div className="flex items-center justify-between gap-4 pb-5 border-b border-stone-200 dark:border-slate-800">
              <div className="text-xs font-mono text-stone-500 dark:text-slate-400 tabular-nums">
                {activeDispatch.sourceName} · {formatUtcClock(activeDispatch.publishedAt)}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => toggleReadLater(activeDispatch, e)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    savedIdsSet.has(activeDispatch.id)
                      ? 'bg-stone-900 text-stone-50 border-stone-900 dark:bg-amber-500 dark:text-slate-950 dark:border-amber-500'
                      : 'bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-300 border-stone-200 dark:border-slate-800 hover:border-stone-400'
                  }`}
                >
                  {savedIdsSet.has(activeDispatch.id) ? (
                    <>
                      <BookmarkCheck className="w-3.5 h-3.5" />
                      <span>Saved in Read Later</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Save for Read Later</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDispatch(null)}
                  aria-label="Close reader"
                  className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-white rounded-md border border-stone-200 dark:border-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Article Header */}
            <div className="py-6">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-slate-400 tabular-nums">
                <span>{activeDispatch.category}</span>
                <span aria-hidden="true">·</span>
                <span className={getSeverityTextStyle(activeDispatch.severity)}>
                  {activeDispatch.severity}
                  {activeDispatch.cvssScore ? ` (CVSS ${activeDispatch.cvssScore.toFixed(1)})` : ''}
                </span>
                {activeDispatch.cveId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-stone-900 dark:text-slate-100">
                      {activeDispatch.cveId}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>{activeDispatch.readingTimeMinutes} min read</span>
              </div>

              <h2
                id="drawer-article-title"
                className="font-serif text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-slate-50 mt-3 leading-tight"
              >
                {activeDispatch.title}
              </h2>

              <p className="text-xs text-stone-500 dark:text-slate-400 mt-2">
                Reported by {activeDispatch.author}
              </p>

              {/* Mode Switcher: Technical Dispatch vs AI Beginner Learning Guide */}
              <div className="mt-5 flex items-center gap-2 p-1 bg-stone-200/70 dark:bg-slate-900 rounded-lg border border-stone-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDrawerTab('technical')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    drawerTab === 'technical'
                      ? 'bg-white dark:bg-slate-800 text-stone-900 dark:text-white shadow-xs'
                      : 'text-stone-600 dark:text-slate-400 hover:text-stone-900'
                  }`}
                >
                  Technical Intelligence Brief
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerTab('beginner-ai');
                    fetchAiBeginnerGuide(activeDispatch, false);
                  }}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    drawerTab === 'beginner-ai'
                      ? 'bg-stone-900 text-stone-50 dark:bg-amber-500 dark:text-slate-950 shadow-xs'
                      : 'text-stone-700 dark:text-amber-300 hover:text-stone-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Beginner Learning Guide (AI)</span>
                </button>
              </div>

              {drawerTab === 'beginner-ai' ? (
                renderBeginnerAiPanel(activeDispatch, false)
              ) : (
                <>
                  {activeDispatch.imageUrl && (
                    <div className="mt-6">
                      <ResilientEditorialImage
                        src={activeDispatch.imageUrl}
                        alt={activeDispatch.title}
                        caption={activeDispatch.imageCaption}
                        aspectClass="aspect-video"
                        category={activeDispatch.category}
                      />
                    </div>
                  )}

                  {/* Editorial Body Prose with Drop Cap */}
                  <div className="mt-6 space-y-4 text-base text-stone-800 dark:text-slate-200 leading-relaxed max-w-prose">
                    {activeDispatch.leadBody.map((paragraph, index) => (
                      <p
                        key={index}
                        className={
                          index === 0
                            ? 'first-letter:text-4xl first-letter:font-serif first-letter:font-semibold first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-stone-950 dark:first-letter:text-amber-400'
                            : ''
                        }
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>

                  {/* Callout Banner to switch to Beginner Learning Mode */}
                  <div className="mt-6 p-4 bg-stone-100 dark:bg-slate-900 border border-stone-200 dark:border-slate-800 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-stone-900 dark:text-slate-100">
                        New to cybersecurity or unfamiliar with the terms in this advisory?
                      </div>
                      <p className="text-xs text-stone-600 dark:text-slate-400 mt-0.5">
                        Switch to the AI Beginner Learning Guide for a plain-English analogy,
                        step-by-step breakdown, and interactive Q&amp;A.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDrawerTab('beginner-ai');
                        fetchAiBeginnerGuide(activeDispatch, false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-50 bg-stone-900 hover:bg-stone-800 dark:bg-amber-500 dark:text-slate-950 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Explain for Beginners</span>
                    </button>
                  </div>

                  {/* Affected Software & Firmware Matrix */}
                  {activeDispatch.affectedProducts &&
                    activeDispatch.affectedProducts.length > 0 && (
                      <div className="mt-8 pt-6 border-t border-stone-200 dark:border-slate-800">
                        <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-slate-100 mb-3">
                          Affected Systems &amp; Patched Releases
                        </h3>
                        <div className="overflow-x-auto border border-stone-200 dark:border-slate-800 rounded-md">
                          <table className="w-full text-left text-xs tabular-nums">
                            <thead className="bg-stone-100 dark:bg-slate-900 text-stone-600 dark:text-slate-400 border-b border-stone-200 dark:border-slate-800">
                              <tr>
                                <th className="py-2.5 px-3 font-semibold">Vendor &amp; Product</th>
                                <th className="py-2.5 px-3 font-semibold">Affected Versions</th>
                                <th className="py-2.5 px-3 font-semibold">Patched Release</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-200 dark:divide-slate-800 bg-white dark:bg-slate-950">
                              {activeDispatch.affectedProducts.map((prod, idx) => (
                                <tr key={idx}>
                                  <td className="py-2.5 px-3 font-medium text-stone-900 dark:text-slate-100">
                                    {prod.vendor} — {prod.product}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-red-700 dark:text-red-400">
                                    {prod.versionsAffected}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-emerald-700 dark:text-emerald-400">
                                    {prod.fixedVersion}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  {/* Indicators of Compromise (IOCs) */}
                  {activeDispatch.iocs && activeDispatch.iocs.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-stone-200 dark:border-slate-800">
                      <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-slate-100 mb-3">
                        Indicators of Compromise (IOCs)
                      </h3>
                      <div className="divide-y divide-stone-200 dark:divide-slate-800 border border-stone-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900">
                        {activeDispatch.iocs.map((ioc, idx) => (
                          <div
                            key={idx}
                            className="p-3 flex items-center justify-between gap-4 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="text-stone-500 dark:text-slate-400">
                                <span className="font-mono font-semibold text-stone-800 dark:text-slate-200">
                                  {ioc.type}
                                </span>{' '}
                                · {ioc.context}
                              </div>
                              <div className="font-mono text-stone-900 dark:text-amber-300 truncate mt-0.5">
                                {ioc.value}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyText(ioc.value)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono border border-stone-200 dark:border-slate-700 rounded hover:bg-stone-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                            >
                              {copiedValue === ioc.value ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Defensive Remediation Steps */}
                  {activeDispatch.remediationSteps &&
                    activeDispatch.remediationSteps.length > 0 && (
                      <div className="mt-8 pt-6 border-t border-stone-200 dark:border-slate-800">
                        <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-slate-100 mb-3">
                          Recommended Defensive Mitigations
                        </h3>
                        <ol className="space-y-2.5 text-sm text-stone-700 dark:text-slate-300 list-decimal list-inside">
                          {activeDispatch.remediationSteps.map((step, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                </>
              )}

              {/* External Source Link */}
              <div className="mt-8 pt-6 border-t border-stone-200 dark:border-slate-800 flex items-center justify-between">
                <a
                  href={activeDispatch.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-900 dark:text-amber-400 hover:underline"
                >
                  <span>Inspect Original Advisory at {activeDispatch.sourceName}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setActiveDispatch(null)}
                  className="px-4 py-2 text-xs font-semibold text-stone-700 dark:text-slate-300 border border-stone-200 dark:border-slate-800 rounded-md hover:bg-stone-100 dark:hover:bg-slate-900 cursor-pointer"
                >
                  Close Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 text-xs font-medium bg-stone-900 text-stone-50 dark:bg-amber-400 dark:text-slate-950 rounded-md shadow-lg border border-stone-700 dark:border-amber-300"
        >
          {toastMessage}
        </div>
      )}

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-stone-200 dark:border-slate-800 py-6 px-6 mt-12">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500 dark:text-slate-400">
          <div>
            Sentinel Wire — Real-Time Cybersecurity News &amp; Vulnerability Syndication
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveSection('feed')}
              className="hover:text-stone-900 dark:hover:text-slate-200 cursor-pointer"
            >
              Live Wire
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('read-later')}
              className="hover:text-stone-900 dark:hover:text-slate-200 cursor-pointer"
            >
              Read Later ({savedArticles.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('sources')}
              className="hover:text-stone-900 dark:hover:text-slate-200 cursor-pointer"
            >
              Manage RSS Sources
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

