/**
 * embed-test-dataset.ts
 *
 * Three things, all idempotent (safe to re-run any time):
 *
 *   1. Embeds any TEST_DATASET (test-dataset.ts) rows that don't already
 *      have a current JobEmbedding — reuses embedCatalogRows(), the same
 *      function the full-catalog backfill (embed-jobs.ts) uses, so already-
 *      embedded/unchanged rows are skipped via the sourceHash check rather
 *      than re-embedded.
 *   2. Checks whether the CV for a given account (by email, defaults to
 *      jacob.6nyberg@gmail.com) is embedded and current, and embeds it if
 *      not — same cache/staleness check RecLabService.ensureCvEmbeddings
 *      does at request time, just run once up front here instead of lazily
 *      on the next Rec Lab request.
 *   3. Resets that account's Rec Lab 2 sort state (recLab2SortHash /
 *      recLab2JobOrder), forcing exactly one fresh re-sort on the next
 *      Rec Lab 2 load. Necessary because RecLab2Service only re-sorts when
 *      the CV embedding changes — if step 1 just finished embedding jobs
 *      that were still missing (e.g. this script got interrupted last
 *      time), the previously-computed order won't reflect them until
 *      something tells it to re-sort. This is that something.
 *
 * Usage:
 *   pnpm rec-lab2:embed
 *   pnpm rec-lab2:embed -- --email=someone@else.com
 */
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma';
import type { CvProfile } from '@apcomp/types';
import { EmbeddingService } from '../modules/rec-lab/embedding.service';
import { embedCatalogRows } from '../modules/rec-lab/catalog-embedding';
import { cvProfileToTexts, hashFieldTexts } from '../modules/rec-lab/text';
import { TEST_DATASET } from '../modules/rec-lab/test-dataset';

const emailArg = process.argv.find(a => a.startsWith('--email='))?.split('=')[1];
const EMAIL = emailArg ?? 'jacob.6nyberg@gmail.com';

const prisma = new PrismaClient();
const embeddings = new EmbeddingService();

async function embedTestDatasetJobs() {
  console.log(`\n1. Test dataset jobs (${TEST_DATASET.length} total)`);
  console.log('─'.repeat(60));

  // Warm the model once up front so the "embedding N jobs" log below
  // reflects real throughput, not a one-time model-load cost.
  process.stdout.write('Loading embedding model (first run downloads ~90MB, cached after)... ');
  await embeddings.embed('warmup');
  console.log('ready\n');

  const result = await embedCatalogRows(prisma, embeddings, TEST_DATASET);
  console.log(
    `Embedded ${result.embedded}, skipped ${result.skipped} (already current), failed ${result.failed}.\n`,
  );
}

async function embedCv(email: string) {
  console.log(`2. CV for ${email}`);
  console.log('─'.repeat(60));

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account found with email ${email} — skipping.\n`);
    return;
  }

  const row = await prisma.cvProfile.findUnique({ where: { userId: user.id } });
  if (!row) {
    console.log(`Account found, but no CV profile uploaded yet — skipping.\n`);
    return;
  }

  const profile: CvProfile = {
    name: row.name ?? undefined,
    email: row.email ?? undefined,
    rawText: row.rawText ?? undefined,
    roles: row.roles as CvProfile['roles'],
    skills: row.skills as CvProfile['skills'],
    practices: row.practices as string[],
    projects: row.projects as CvProfile['projects'],
    gapQuestions: row.gapQuestions as CvProfile['gapQuestions'],
    isComplete: row.isComplete,
  };

  const texts = cvProfileToTexts(profile);
  const hash = hashFieldTexts(texts);

  const alreadyCurrent =
    row.embeddingSourceHash === hash &&
    row.titleEmbedding.length > 0 &&
    row.descriptionEmbedding.length > 0;

  if (alreadyCurrent) {
    console.log('Already embedded and current — nothing to do.\n');
    return;
  }

  console.log('Embedding CV...');
  const [title, description] = await embeddings.embedBatch([texts.title, texts.description]);

  await prisma.cvProfile.update({
    where: { userId: user.id },
    data: {
      titleEmbedding: title,
      descriptionEmbedding: description,
      skillsEmbedding: [],
      embeddingSourceHash: hash,
      embeddingUpdatedAt: new Date(),
    },
  });

  console.log('Done.\n');
}

/**
 * Forces one fresh re-sort on the next Rec Lab 2 load for this account,
 * regardless of whether its CV embedding actually changed. Safe/cheap to
 * call unconditionally — if there's no account or no CV yet, it's a no-op;
 * if the CV embedding didn't change, RecLab2Service just recomputes the
 * exact same sort it already had.
 */
async function resetRecLab2Sort(email: string) {
  console.log(`3. Rec Lab 2 sort state for ${email}`);
  console.log('─'.repeat(60));

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account found with email ${email} — skipping.\n`);
    return;
  }

  const row = await prisma.cvProfile.findUnique({ where: { userId: user.id } });
  if (!row) {
    console.log(`Account found, but no CV profile uploaded yet — skipping.\n`);
    return;
  }

  await prisma.cvProfile.update({
    where: { userId: user.id },
    data: { recLab2SortHash: null, recLab2JobOrder: [] },
  });
  console.log('Cleared — next Rec Lab 2 load will re-sort using every job embedded as of right now.\n');
}

async function main() {
  console.log('\nApComp Rec Lab 2 fixture embedding');
  await prisma.$connect();

  await embedTestDatasetJobs();
  await embedCv(EMAIL);
  await resetRecLab2Sort(EMAIL);

  await prisma.$disconnect();
  console.log('All done.\n');
}

main().catch(err => {
  console.error('\n' + (err?.message ?? err));
  process.exit(1);
});
