import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { CURATED_DISPATCHES, DEFAULT_SOURCES } from './src/data/curatedDispatches.ts';
import {
  BeginnerThreatGuide,
  CyberDispatch,
  DispatchCategory,
  NewsSourceConfig,
  SeverityLevel,
} from './src/types/news.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory store for custom sources & cached AI beginner explanations
const customSources: NewsSourceConfig[] = [];
let cachedLiveDispatches: CyberDispatch[] = [];
let lastFetchTimestamp = 0;
const aiGuideCache = new Map<string, BeginnerThreatGuide>();

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyArticle(title: string, summary: string): {
  category: DispatchCategory;
  severity: SeverityLevel;
  cveId?: string;
  cvssScore?: number;
  activelyExploited?: boolean;
} {
  const combined = `${title} ${summary}`;
  const lower = combined.toLowerCase();
  const cveMatch = combined.match(/CVE-\d{4}-\d{4,7}/i);
  const cveId = cveMatch ? cveMatch[0].toUpperCase() : undefined;

  let category = DispatchCategory.THREAT_INTEL;
  if (lower.includes('ransomware') || lower.includes('extortion') || lower.includes('decryptor')) {
    category = DispatchCategory.RANSOMWARE;
  } else if (
    lower.includes('zero-day') ||
    lower.includes('0-day') ||
    lower.includes('rce') ||
    lower.includes('remote code execution') ||
    lower.includes('exploit') ||
    Boolean(cveId)
  ) {
    category = DispatchCategory.ZERO_DAY;
  } else if (
    lower.includes('cloud') ||
    lower.includes('kubernetes') ||
    lower.includes('aws') ||
    lower.includes('bgp') ||
    lower.includes('router')
  ) {
    category = DispatchCategory.CLOUD_INFRA;
  } else if (lower.includes('cisa') || lower.includes('patch') || lower.includes('advisory')) {
    category = DispatchCategory.ADVISORY;
  } else if (
    lower.includes('nist') ||
    lower.includes('regulation') ||
    lower.includes('directive') ||
    lower.includes('compliance') ||
    lower.includes('policy')
  ) {
    category = DispatchCategory.POLICY;
  }

  let severity = SeverityLevel.ELEVATED;
  let cvssScore: number | undefined;
  let activelyExploited = false;

  if (
    lower.includes('zero-day') ||
    lower.includes('actively exploited') ||
    lower.includes('critical') ||
    lower.includes('unauthenticated') ||
    lower.includes('rce')
  ) {
    severity = SeverityLevel.CRITICAL;
    cvssScore = 9.4;
    activelyExploited =
      lower.includes('actively') || lower.includes('zero-day') || lower.includes('in the wild');
  } else if (
    lower.includes('high') ||
    lower.includes('ransomware') ||
    lower.includes('breach') ||
    Boolean(cveId)
  ) {
    severity = SeverityLevel.HIGH;
    cvssScore = 8.1;
  } else if (category === DispatchCategory.POLICY) {
    severity = SeverityLevel.INFORMATIONAL;
  }

  return { category, severity, cveId, cvssScore, activelyExploited };
}

function parseRssXml(xml: string, source: NewsSourceConfig): CyberDispatch[] {
  const items: CyberDispatch[] = [];
  const itemRegex = /<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = itemRegex.exec(xml)) !== null && count < 6) {
    const block = match[1];
    const titleMatch = block.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
    const linkMatch =
      block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i) ||
      block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(
      /<(?:description|summary|content:encoded|content)(?:\s[^>]*)?>([\s\S]*?)<\/(?:description|summary|content:encoded|content)>/i
    );
    const dateMatch = block.match(
      /<(?:pubDate|published|updated|dc:date)(?:\s[^>]*)?>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i
    );
    const authorMatch = block.match(
      /<(?:dc:creator|author|name)(?:\s[^>]*)?>([\s\S]*?)<\/(?:dc:creator|author|name)>/i
    );

    const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';
    if (!rawTitle || rawTitle.length < 10) continue;

    const rawLink = linkMatch ? decodeXmlEntities(linkMatch[1]) : source.siteUrl;
    const rawDesc = descMatch ? decodeXmlEntities(descMatch[1]) : '';
    const cleanSummary =
      rawDesc.length > 260
        ? `${rawDesc.slice(0, 257).replace(/\s+\S*$/, '')}...`
        : rawDesc || `Live security dispatch aggregated from ${source.name}.`;

    const pubDate = dateMatch ? new Date(decodeXmlEntities(dateMatch[1])) : new Date();
    const validPubDate = Number.isNaN(pubDate.getTime())
      ? new Date().toISOString()
      : pubDate.toISOString();
    const author = authorMatch
      ? decodeXmlEntities(authorMatch[1]).slice(0, 48)
      : `${source.name} Editorial Desk`;

    const classification = classifyArticle(rawTitle, cleanSummary);

    const paragraphs = rawDesc
      .split(/(?<=\.)\s+(?=[A-Z])/)
      .reduce<string[]>((acc, sentence, idx) => {
        const bucket = Math.floor(idx / 3);
        acc[bucket] = acc[bucket] ? `${acc[bucket]} ${sentence}` : sentence;
        return acc;
      }, [])
      .slice(0, 4);

    items.push({
      id: `live-${source.id}-${Buffer.from(rawTitle).toString('base64').slice(0, 16)}`,
      title: rawTitle,
      summary: cleanSummary,
      leadBody:
        paragraphs.length > 0
          ? paragraphs
          : [
              cleanSummary,
              `This live dispatch was ingested directly from ${source.name} via the Sentinel Wire real-time syndication pipeline. Security teams can inspect the original advisory for full vendor patch links and raw telemetry.`,
            ],
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: rawLink.startsWith('http') ? rawLink : source.siteUrl,
      author,
      publishedAt: validPubDate,
      readingTimeMinutes: Math.max(2, Math.min(8, Math.ceil(rawDesc.split(/\s+/).length / 130))),
      category: classification.category,
      severity: classification.severity,
      cveId: classification.cveId,
      cvssScore: classification.cvssScore,
      activelyExploited: classification.activelyExploited,
      isLiveRss: true,
    });
    count++;
  }

  return items;
}

async function fetchLiveFeeds(force = false): Promise<{
  dispatches: CyberDispatch[];
  sources: NewsSourceConfig[];
}> {
  const now = Date.now();
  const allSources = [...DEFAULT_SOURCES, ...customSources];

  if (!force && cachedLiveDispatches.length > 0 && now - lastFetchTimestamp < 45_000) {
    return {
      dispatches: mergeAndSortDispatches(cachedLiveDispatches),
      sources: allSources,
    };
  }

  const rssSources = allSources.filter((s) => s.enabled && !s.feedUrl.endsWith('.json'));
  const fetchedItems: CyberDispatch[] = [];

  await Promise.allSettled(
    rssSources.map(async (source) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3800);
      try {
        const res = await fetch(source.feedUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SentinelWire-SecurityAggregator/1.0 (+https://cisa.gov)',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
        });
        if (!res.ok) return;
        const xmlText = await res.text();
        const parsed = parseRssXml(xmlText, source);
        if (parsed.length > 0) {
          source.articleCount = parsed.length;
          source.lastSyncedAt = new Date().toISOString();
          fetchedItems.push(...parsed);
        }
      } catch {
        // Keep curated fallback seamlessly if a third-party RSS feed times out in sandbox
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  cachedLiveDispatches = fetchedItems;
  lastFetchTimestamp = now;

  return {
    dispatches: mergeAndSortDispatches(fetchedItems),
    sources: allSources,
  };
}

function mergeAndSortDispatches(liveItems: CyberDispatch[]): CyberDispatch[] {
  const map = new Map<string, CyberDispatch>();
  for (const item of CURATED_DISPATCHES) {
    map.set(item.title.toLowerCase(), item);
  }
  for (const item of liveItems) {
    const key = item.title.toLowerCase();
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/feed', async (req, res) => {
    const force = req.query.force === 'true';
    const data = await fetchLiveFeeds(force);
    res.json({
      syncedAt: new Date().toISOString(),
      totalCount: data.dispatches.length,
      dispatches: data.dispatches,
      sources: data.sources,
    });
  });

  app.post('/api/sources', async (req, res) => {
    const { name, feedUrl, siteUrl, publisherType } = req.body || {};
    if (!name || !feedUrl) {
      res.status(400).json({ error: 'Source name and RSS/Atom feed URL are required.' });
      return;
    }

    const newSource: NewsSourceConfig = {
      id: `custom-${Date.now()}`,
      name: String(name).trim(),
      publisherType: publisherType || 'Community Feed',
      feedUrl: String(feedUrl).trim(),
      siteUrl: String(siteUrl || feedUrl).trim(),
      enabled: true,
      articleCount: 1,
      lastSyncedAt: new Date().toISOString(),
      status: 'Custom',
    };

    customSources.push(newSource);
    const data = await fetchLiveFeeds(true);
    res.status(201).json({
      source: newSource,
      dispatches: data.dispatches,
      sources: data.sources,
    });
  });

  // Server-Side Gemini Endpoint: Generate Beginner Threat Learning Guide for any article
  app.post('/api/ai/explain', async (req, res) => {
    try {
      const { dispatch, forceRegenerate } = req.body as {
        dispatch?: CyberDispatch;
        forceRegenerate?: boolean;
      };

      if (!dispatch || !dispatch.title) {
        res.status(400).json({ error: 'A valid threat dispatch is required.' });
        return;
      }

      if (!forceRegenerate && dispatch.id && aiGuideCache.has(dispatch.id)) {
        res.json({ guide: aiGuideCache.get(dispatch.id), cached: true });
        return;
      }

      const ai = getGeminiClient();
      const articleContext = [
        `Headline: ${dispatch.title}`,
        `Category: ${dispatch.category} | Severity: ${dispatch.severity}`,
        dispatch.cveId ? `CVE ID: ${dispatch.cveId} (CVSS: ${dispatch.cvssScore ?? 'N/A'})` : '',
        `Summary: ${dispatch.summary}`,
        `Details: ${(dispatch.leadBody || []).join(' ')}`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Break down the following cybersecurity threat news article so a complete beginner or student with no prior security background can easily understand what happened, how the threat works, and why it matters.\n\n${articleContext}`,
        config: {
          systemInstruction:
            'You are a friendly, crystal-clear cybersecurity educator for beginners. Avoid unexplained jargon. Use vivid, relatable everyday analogies and practical takeaways.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plainEnglishSummary: {
                type: Type.STRING,
                description:
                  '2-3 sentences explaining what happened in simple, everyday language without technical jargon.',
              },
              realWorldAnalogy: {
                type: Type.STRING,
                description:
                  'A relatable real-world analogy (e.g. locks, postal mail, building security badges, highway signs) that makes the technical concept click immediately.',
              },
              attackSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Exactly 3 concise, chronological steps showing how an attacker carries out this threat from start to finish in plain terms.',
              },
              whyItMatters: {
                type: Type.STRING,
                description:
                  'Why everyday people, students, or businesses should care about this threat and what could happen if ignored.',
              },
              personalProtectionTip: {
                type: Type.STRING,
                description:
                  '1 concrete habit or safety lesson beginners can apply to their own digital life or studies.',
              },
              jargonDecoder: {
                type: Type.ARRAY,
                description:
                  '3 to 4 technical cybersecurity terms from the article translated into 1-sentence beginner definitions.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                  },
                  required: ['term', 'definition'],
                },
              },
              quiz: {
                type: Type.OBJECT,
                description:
                  'A single multiple-choice comprehension question with 3 options so the beginner can test what they just learned.',
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctIndex: {
                    type: Type.INTEGER,
                    description: '0-based index of the correct option (0, 1, or 2).',
                  },
                  explanation: {
                    type: Type.STRING,
                    description: '1-sentence explanation of why that answer is correct.',
                  },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
            required: [
              'plainEnglishSummary',
              'realWorldAnalogy',
              'attackSteps',
              'whyItMatters',
              'personalProtectionTip',
              'jargonDecoder',
              'quiz',
            ],
          },
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      const parsedGuide = JSON.parse(rawJson) as BeginnerThreatGuide;

      if (dispatch.id) {
        aiGuideCache.set(dispatch.id, parsedGuide);
      }

      res.json({ guide: parsedGuide, cached: false });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate AI beginner threat guide.';
      res.status(500).json({ error: message });
    }
  });

  // Server-Side Gemini Endpoint: Ask a follow-up beginner question about a specific threat
  app.post('/api/ai/ask', async (req, res) => {
    try {
      const { dispatch, question } = req.body as {
        dispatch?: CyberDispatch;
        question?: string;
      };

      if (!dispatch || !question || !question.trim()) {
        res.status(400).json({ error: 'Both the threat article and question are required.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = [
        `Threat Article Title: ${dispatch.title}`,
        `Category: ${dispatch.category} | Severity: ${dispatch.severity} | CVE: ${dispatch.cveId || 'N/A'}`,
        `Article Summary: ${dispatch.summary}`,
        `Article Details: ${(dispatch.leadBody || []).join(' ')}`,
        '',
        `Beginner's Question: ${question.trim()}`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a patient, encouraging cybersecurity mentor helping a beginner understand a threat news story. Answer their question directly in 2 to 4 clear sentences using plain language and a brief example if helpful. Do not use markdown headers.',
        },
      });

      res.json({
        answer:
          response.text?.trim() ||
          'I could not generate an answer right now. Please try asking in a different way.',
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to answer question via Gemini API.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sentinel Wire server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
