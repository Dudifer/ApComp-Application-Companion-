import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CvProfile, GapAnswerPayload } from '@apcomp/types';
import { PdfParser } from './parsers/pdf.parser';
import { DocxParser } from './parsers/docx.parser';
import { AiExtractorService } from './ai-extractor.service';
import { PrismaService } from '../prisma/prisma.service';

// const DEV_USER_ID = 'dev-user';

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    private readonly pdfParser: PdfParser,
    private readonly docxParser: DocxParser,
    private readonly aiExtractor: AiExtractorService,
    private readonly prisma: PrismaService,
  ) {}

  // private async ensureDevUser() {
  //   return this.prisma.user.upsert({
  //     where: { id: DEV_USER_ID },
  //     update: {},
  //     create: {
  //       id: DEV_USER_ID,
  //       email: 'dev@apcomp.local',
  //       name: 'Dev User',
  //     },
  //   });
  // }

  async processUpload(userId: string, file: Express.Multer.File): Promise<CvProfile> {
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

    // await this.ensureDevUser();
    await this.saveProfile(userId, profile);

    return profile;
  }

  async submitGapAnswers(userId: string, answers: GapAnswerPayload[]): Promise<CvProfile> {
    const profile = await this.getProfile(userId);
    if (!profile) {
      throw new BadRequestException('No profile found. Please upload your CV first.');
    }

    const refined = await this.aiExtractor.refineProfileWithAnswers(profile, answers);
    await this.saveProfile(userId, refined);
    return refined;
  }

  async getProfile(userId: string): Promise<CvProfile | null> {
    const row = await this.prisma.cvProfile.findUnique({
      where: { userId },
    });

    if (!row) return null;

    return {
      name: row.name ?? undefined,
      email: row.email ?? undefined,
      rawText: row.rawText ?? undefined,
      roles: row.roles as CvProfile['roles'],
      skills: row.skills as CvProfile['skills'],
      practices: row.practices as string[],
      education: (row as any).education as CvProfile['education'] ?? [],
      gapQuestions: row.gapQuestions as CvProfile['gapQuestions'],
      isComplete: row.isComplete,
    };
  }

  private async saveProfile(userId: string, profile: CvProfile) {
    // Cast the inputs to `any` for the education field path so TypeScript
    // tolerates a Prisma client that hasn't been regenerated yet against the
    // new `education` column. After `prisma migrate dev` (or `prisma generate`)
    // the column is in the generated types and this stays sound at runtime.
    const data: any = {
      name: profile.name,
      email: profile.email,
      rawText: profile.rawText,
      roles: profile.roles,
      skills: profile.skills,
      practices: profile.practices,
      education: profile.education ?? [],
      gapQuestions: profile.gapQuestions,
      isComplete: profile.isComplete,
    };
    await this.prisma.cvProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  async deleteProfile(userId: string) {
    await this.prisma.cvProfile.deleteMany({ where: { userId } });
  }
}
