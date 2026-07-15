import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

// Cache the model weights outside node_modules. @xenova/transformers
// defaults to caching inside node_modules/@xenova/transformers/.cache/,
// which gets recreated (wiping the cache) by any `pnpm install` / rebuild —
// something this project's Windows setup has needed to do repeatedly
// (approve-builds, rebuild sharp, memory-crash troubleshooting, etc). A
// stable path here means the ~90MB model download only ever happens once,
// regardless of how many times node_modules gets touched afterward.
const MODEL_CACHE_DIR = path.join(__dirname, '..', '..', '..', '.model-cache');

/**
 * Local, free, offline embedding model — no API key, no per-call cost.
 * Uses Xenova/all-MiniLM-L6-v2 (384-dim sentence embeddings) via
 * @xenova/transformers (Transformers.js), which runs entirely on-device.
 *
 * The model weights (~90MB) download once on first use and are cached in
 * MODEL_CACHE_DIR (see above) — first call after a fresh cache will be
 * noticeably slower than subsequent ones, including across separate process
 * invocations (e.g. embed-jobs-loop.ts's per-chunk restarts), since the
 * cache lives on disk at a fixed path, not in process memory.
 *
 * @xenova/transformers ships as ESM; we load it with a dynamic import so
 * this still works cleanly from NestJS's CommonJS build output.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private pipelinePromise: Promise<any> | null = null;

  private async getPipeline(): Promise<any> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });
        const { pipeline, env } = await import('@xenova/transformers');
        env.cacheDir = MODEL_CACHE_DIR;
        this.logger.log(`Loading local embedding model (Xenova/all-MiniLM-L6-v2), cache: ${MODEL_CACHE_DIR}`);
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        this.logger.log('Embedding model ready.');
        return extractor;
      })();
    }
    return this.pipelinePromise;
  }

  /** Embeds a single string, returning a normalized 384-dim vector. */
  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  /**
   * Embeds multiple strings in one pass (cheaper than N separate calls once
   * the model is warm). Falls back to per-item embedding if the underlying
   * pipeline call fails for the whole batch, so one bad input doesn't sink
   * an entire ranking request.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const extractor = await this.getPipeline();

    try {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      // Transformers.js returns a Tensor with `.tolist()`; shape is [batch, dim].
      const list: number[][] = output.tolist();
      return list;
    } catch (err) {
      this.logger.warn('Batch embedding failed, falling back to one-by-one', err as Error);
      const results: number[][] = [];
      for (const text of texts) {
        try {
          const output = await extractor([text], { pooling: 'mean', normalize: true });
          results.push(output.tolist()[0]);
        } catch (innerErr) {
          this.logger.error(`Failed to embed text (len ${text.length}), using zero vector`, innerErr as Error);
          results.push(new Array(384).fill(0));
        }
      }
      return results;
    }
  }
}
