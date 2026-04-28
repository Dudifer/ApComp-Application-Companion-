import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CvProfile, GapAnswerPayload } from '@apcomp/types';
import { PdfParser } from './parsers/pdf.parser';
import { DocxParser } from './parsers/docx.parser';
import { AiExtractorService } from './ai-extractor.service';

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  // In-memory store per session until auth + DB are wired up
  private profileStore: CvProfile | null = null;

  constructor(
    private readonly pdfParser: PdfParser,
    private readonly docxParser: DocxParser,
    private readonly aiExtractor: AiExtractorService,
  ) {}

  async processUpload(
    file: Express.Multer.File,
  ): Promise<CvProfile> {
    const mime = file.mimetype;
    let rawText: string;

    if (mime === 'application/pdf') {
      rawText = await this.pdfParser.extractText(file.buffer);
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) {
      rawText = await this.docxParser.extractText(file.buffer);
    } else {
      throw new BadRequestException('Only PDF and DOCX files are supported.');
    }

    if (!rawText || rawText.length < 100) {
      throw new BadRequestException(
        'Could not extract text from this file. If it is a scanned PDF, please use a text-based version.',
      );
    }

    this.logger.log(`Extracted ${rawText.length} characters from CV`);
    const profile = await this.aiExtractor.extractProfile(rawText);
    this.profileStore = profile;
    return profile;
  }

  async submitGapAnswers(answers: GapAnswerPayload[]): Promise<CvProfile> {
    if (!this.profileStore) {
      throw new BadRequestException('No profile found. Please upload your CV first.');
    }

    const refined = await this.aiExtractor.refineProfileWithAnswers(
      this.profileStore,
      answers,
    );

    this.profileStore = refined;
    return refined;
  }

  getProfile(): CvProfile | null {
    return this.profileStore;
  }
}
