import { Injectable, Logger } from '@nestjs/common';

/**
 * Local, free, offline embedding model — no API key, no per-call cost.
 * Uses Xenova/all-MiniLM-L6-v2 (384-dim sentence embeddings) via
 * @xenova/transformers (Transformers.js), which runs entirely on-device.
 *
 * The model weights (~90MB) download once on first use and are cached
 * under the OS cache dir (or TRANSFORMERS_CACHE if set) — first call after
 * a fresh install will be noticeably slower than subsequent ones.
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
        this.logger.log('Loading local embedding model (Xenova/all-MiniLM-L6-v2)...');
        const { pipeline } = await import('@xenova/transformers');
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
