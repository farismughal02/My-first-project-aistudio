import { DispatchCategory, SeverityLevel } from '../src/types/news.ts';
import type { CyberDispatch, NewsSourceConfig } from '../src/types/news.ts';
import { articleId } from './domain.ts';

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

  // Keywords suggest a category, not an authoritative vulnerability assessment.
  return { category, severity: SeverityLevel.UNKNOWN };

}

export function parseRssXml(xml: string, source: NewsSourceConfig): CyberDispatch[] {
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

    const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1]).slice(0, 500) : '';
    if (!rawTitle || rawTitle.length < 10) continue;

    let rawLink = source.siteUrl;
    try {
      const candidate = new URL(linkMatch ? decodeXmlEntities(linkMatch[1]) : source.siteUrl, source.siteUrl);
      if (['https:', 'http:'].includes(candidate.protocol) && !candidate.username && !candidate.password) rawLink = candidate.href;
    } catch { /* Keep the publisher URL for malformed links. */ }
    const rawDesc = descMatch ? decodeXmlEntities(descMatch[1]).slice(0, 12000) : '';
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
      id: articleId(source.id, rawLink !== source.siteUrl ? rawLink : rawTitle),
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
      dataOrigin: 'live',
    });
    count++;
  }

  return items;
}

