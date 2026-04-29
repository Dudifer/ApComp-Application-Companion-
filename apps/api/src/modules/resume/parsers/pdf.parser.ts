import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  async extractText(buffer: Buffer): Promise<string> {
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      this.logger.log(`getText returned: ${JSON.stringify(result).slice(0, 200)}`);
      const text = (result as any).pages
        .map((p: any) => p.text ?? '')
        .join('\n')
        .trim();
      return text;
    } catch (err) {
      this.logger.error('PDF parsing failed', err);
      throw new Error('Could not parse PDF. Please ensure it is not scanned/image-based.');
    }
  }
}
