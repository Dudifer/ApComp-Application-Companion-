import { Injectable, Logger } from '@nestjs/common';
import pdfParse from 'pdf-parse';

@Injectable()
export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  async extractText(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text.trim();
    } catch (err) {
      this.logger.error('PDF parsing failed', err);
      throw new Error('Could not parse PDF. Please ensure it is not scanned/image-based.');
    }
  }
}
