import { createHash } from 'node:crypto';
import type { BeginnerThreatGuide, CyberDispatch } from '../src/types/news.ts';

export function articleId(source: string, identity: string): string {
  return `live-${source}-${createHash('sha256').update(identity).digest('hex')}`;
}
export function guideKey(article: CyberDispatch, model: string): string {
  return createHash('sha256').update(JSON.stringify([model, 'guide-v1', article])).digest('hex');
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const strings = (v: unknown, min: number, max: number): v is string[] => Array.isArray(v) && v.length >= min && v.length <= max && v.every(x => text(x));

export function validateGuide(value: unknown): BeginnerThreatGuide {
  if (!object(value) || !['plainEnglishSummary', 'realWorldAnalogy', 'whyItMatters', 'personalProtectionTip'].every(k => text(value[k])) ||
      !strings(value.attackSteps, 3, 3) || !Array.isArray(value.jargonDecoder) || value.jargonDecoder.length < 3 || value.jargonDecoder.length > 4 ||
      !value.jargonDecoder.every(x => object(x) && text(x.term, 150) && text(x.definition)) ||
      !object(value.quiz) || !text(value.quiz.question) || !text(value.quiz.explanation) || !strings(value.quiz.options, 3, 3) ||
      !Number.isInteger(value.quiz.correctIndex) || Number(value.quiz.correctIndex) < 0 || Number(value.quiz.correctIndex) > 2) {
    throw new Error('Invalid AI guide.');
  }
  return value as unknown as BeginnerThreatGuide;
}

export function validateAiRequest(value: unknown, ask = false): { articleId: string; question?: string; forceRegenerate: boolean } {
  if (!object(value) || !text(value.articleId, 200) || (value.forceRegenerate !== undefined && typeof value.forceRegenerate !== 'boolean') ||
      (ask && !text(value.question, 1000))) throw new Error('Provide a valid article ID and a question of at most 1,000 characters.');
  return { articleId: value.articleId, question: ask ? (value.question as string).trim() : undefined, forceRegenerate: value.forceRegenerate === true };
}

export class GuideCache {
  private entries = new Map<string, { guide: BeginnerThreatGuide; expires: number }>();
  constructor(private max = 200, private ttl = 3_600_000) {}
  get(key: string, now = Date.now()): BeginnerThreatGuide | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expires > now) return entry.guide;
    this.entries.delete(key);
    return undefined;
  }
  set(key: string, guide: BeginnerThreatGuide, now = Date.now()): void {
    for (const [id, entry] of this.entries) if (entry.expires <= now) this.entries.delete(id);
    this.entries.delete(key);
    while (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { guide, expires: now + this.ttl });
  }
}
