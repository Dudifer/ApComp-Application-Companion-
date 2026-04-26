import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';

@Injectable()
export class DocxParser {
  private readonly logger = new Logger(DocxParser.name);

  async extractText(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    } catch (err) {
      this.logger.error('DOCX parsing failed', err);
      throw new Error('Could not parse DOCX file.');
    }
  }
}
