import { pipeline } from '@xenova/transformers';

/**
 * Mirrors the REAL pipeline exactly, post-redesign (skills folded into
 * description, see text.ts):
 *   text.ts:jobToTexts() / cvProfileToTexts() -> builds {title, description} strings
 *   catalog-embedding.ts:embedCatalogRows()   -> flattens to [t,d,t,d,...] and
 *                                                 calls embeddings.embedBatch() once per chunk
 *   embedding.service.ts                      -> extractor(texts, {pooling:'mean', normalize:true})
 *   scoring.ts:computeCvSimilarity()          -> title*0.35 + description*0.65
 *
 * Three "rows": a CV and two jobs, so you can see both job-to-job similarity
 * and CV-to-job similarity (the actual recommendation comparison) side by side.
 */

const CV_SIMILARITY_WEIGHTS = { title: 0.35, description: 0.65 }; // scoring.ts, exact values

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Exactly text.ts's jobToTexts() for a job_catalog row.
function jobToTexts(row) {
  const description = stripHtml(row.description ?? '') || 'No description available';
  return { title: row.title || 'Untitled role', description };
}

// Exactly text.ts's cvProfileToTexts() shape: title = role titles joined,
// description = role/project descriptions with "Skills: ..." appended.
function cvToTexts(cv) {
  const title = cv.roles.map(r => r.title).join(' | ');
  const skillsText = cv.skills.join(', ');
  const description = [
    ...cv.roles.map(r => r.description),
    skillsText ? `Skills: ${skillsText}` : '',
  ].filter(Boolean).join('\n');
  return { title, description };
}

const cv = {
  roles: [
    { title: 'Junior Developer', description: `Desgined, developed and documented the application run on the touchscreen in front of the main entrance to the UI Main library, 
      promoting doctoral research and facilitating visitor engagement with library features and spaces as well as campus activities.
      Established, dumped and restored SQL databases. 
      Deployed, maintained and migrated of public facing applications. 
      Used Ansible to automated remote server updates for Omeka websites. 
      Implemented SEO strategies on Studio websites and created a dashboard to measure and visualize past and present performance metrics.` },
    { title: 'Junior Developer', description: 'Contributed to feature expansion and maintenance of online library system.' },
    { title: 'App Developer', description: 'Built and maintained Node.js/TypeScript APIs on Postgres, owned services end to end in production.' },
    
  ],
  skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS'],
};

const jobs = [
  {
    title: 'Junior Programmer',
    department: 'Engineering',
    workplaceType: 'Remote',
    description: '<p>Build and scale our Node.js APIs. Own services end to end.</p>',
  },
  {
    title: 'Retail Store Associate',
    department: 'Retail',
    workplaceType: 'On-site',
    description: '<p>Assist customers on the sales floor, operate the register, restock shelves.</p>',
  },
];

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

const candidates = [
  { label: `CV`, texts: cvToTexts(cv) },
  ...jobs.map(row => ({ label: `Job: "${row.title}"`, texts: jobToTexts(row) })),
];

// Exactly embedCatalogRows()'s flatten-then-batch step: [title0, desc0, title1, desc1, ...]
const flatTexts = candidates.flatMap(c => [c.texts.title, c.texts.description]);
const output = await extractor(flatTexts, { pooling: 'mean', normalize: true });
const flatVectors = output.tolist();

candidates.forEach((c, i) => {
  c.vectors = { title: flatVectors[i * 2], description: flatVectors[i * 2 + 1] };
  console.log(`\n=== ${c.label} ===`);
  console.log('title text:      ', JSON.stringify(c.texts.title));
  console.log('description text:', JSON.stringify(c.texts.description));
  console.log('titleEmbedding[0:8]:      ', c.vectors.title.slice(0, 8).map(v => v.toFixed(4)));
  console.log('descriptionEmbedding[0:8]:', c.vectors.description.slice(0, 8).map(v => v.toFixed(4)));
});

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function toPercent(cos) {
  return Math.round(((Math.max(-1, Math.min(1, cos)) + 1) / 2) * 100);
}
// Exactly scoring.ts's computeCvSimilarity().
function computeCvSimilarity(cvVecs, jobVecs) {
  const title = toPercent(cosineSimilarity(cvVecs.title, jobVecs.title));
  const description = toPercent(cosineSimilarity(cvVecs.description, jobVecs.description));
  const combined = Math.round(title * CV_SIMILARITY_WEIGHTS.title + description * CV_SIMILARITY_WEIGHTS.description);
  return { title, description, combined };
}

const [cvRow, ...jobRows] = candidates;

console.log('\n=== CV ↔ job similarity (this is exactly what RecLabService.rank() computes) ===');
for (const j of jobRows) {
  const b = computeCvSimilarity(cvRow.vectors, j.vectors);
  console.log(`${j.label}`);
  console.log(`  title match: ${b.title}%   description+skills match: ${b.description}%   combined: ${b.combined}%`);
}

console.log('\n=== job ↔ job similarity, for reference ===');
console.log('title cosine:      ', cosineSimilarity(jobRows[0].vectors.title, jobRows[1].vectors.title).toFixed(4));
console.log('description cosine:', cosineSimilarity(jobRows[0].vectors.description, jobRows[1].vectors.description).toFixed(4));
