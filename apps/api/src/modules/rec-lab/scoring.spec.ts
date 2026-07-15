import {
  INTERACTION_WEIGHTS,
  NEGATIVE_PROPAGATION_TYPES,
  SUPPRESSION_TYPES,
  SUPPRESSED_SCORE_FLOOR,
  DISLIKE_PENALTY_WEIGHT,
  aggregateInteractionScore,
  applyMostRecentSuppression,
  cosineSimilarity,
  toPercent,
  computeCvSimilarity,
  compositeEmbedding,
  similarityToLikedJobs,
  normalizeInteractionScore,
  rankCandidates,
  type Candidate,
  type FieldEmbeddings,
} from './scoring';

describe('cosineSimilarity / toPercent', () => {
  it('maps identical vectors to 100%', () => {
    expect(toPercent(cosineSimilarity([1, 0], [1, 0]))).toBe(100);
  });
  it('maps orthogonal vectors to 50%', () => {
    expect(toPercent(cosineSimilarity([1, 0], [0, 1]))).toBe(50);
  });
  it('maps opposite vectors to 0%', () => {
    expect(toPercent(cosineSimilarity([1, 0], [-1, 0]))).toBe(0);
  });
  it('returns 0 for empty or mismatched-length vectors instead of throwing', () => {
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('INTERACTION_WEIGHTS', () => {
  it('orders positive signals sensibly (applied > more-like-this > saved > clicked)', () => {
    // "More like this" is a deliberate, explicit taste signal aimed straight
    // at the recommender, so it outweighs a plain save (more about personal
    // bookmarking than feedback) — but a real application is still the
    // strongest possible signal of relevance.
    expect(INTERACTION_WEIGHTS.APPLIED).toBeGreaterThan(INTERACTION_WEIGHTS.MORE_LIKE_THIS);
    expect(INTERACTION_WEIGHTS.MORE_LIKE_THIS).toBeGreaterThan(INTERACTION_WEIGHTS.SAVED);
    expect(INTERACTION_WEIGHTS.SAVED).toBeGreaterThan(INTERACTION_WEIGHTS.CLICKED);
    expect(INTERACTION_WEIGHTS.CLICKED).toBeGreaterThan(0);
  });
  it('makes less-like-this the strongest negative signal', () => {
    expect(INTERACTION_WEIGHTS.LESS_LIKE_THIS).toBeLessThan(INTERACTION_WEIGHTS.DISMISSED);
    expect(INTERACTION_WEIGHTS.DISMISSED).toBeLessThan(INTERACTION_WEIGHTS.IGNORED);
    expect(INTERACTION_WEIGHTS.IGNORED).toBeLessThan(0);
  });
  it('treats a view with no action as neutral', () => {
    expect(INTERACTION_WEIGHTS.VIEWED).toBe(0);
  });
});

describe('aggregateInteractionScore', () => {
  it('sums weights without decay', () => {
    const score = aggregateInteractionScore([
      { weight: 5, createdAt: new Date() },
      { weight: -6, createdAt: new Date() },
    ]);
    expect(score).toBe(-1);
  });

  it('decays older interactions toward zero with decay enabled', () => {
    const now = new Date('2026-07-08T00:00:00Z');
    const recent = aggregateInteractionScore(
      [{ weight: 10, createdAt: now }],
      { decay: true, now },
    );
    const oneHalfLifeAgo = aggregateInteractionScore(
      [{ weight: 10, createdAt: new Date(now.getTime() - 30 * 86_400_000) }],
      { decay: true, now },
    );
    expect(recent).toBeCloseTo(10, 5);
    expect(oneHalfLifeAgo).toBeCloseTo(5, 5);
  });

  it('replaying an interaction (changing its stored weight) changes the aggregate', () => {
    const base = [{ weight: INTERACTION_WEIGHTS.DISMISSED, createdAt: new Date() }];
    const replayed = [{ weight: INTERACTION_WEIGHTS.SAVED, createdAt: new Date() }];
    expect(aggregateInteractionScore(base)).toBeLessThan(aggregateInteractionScore(replayed));
  });
});

describe('normalizeInteractionScore', () => {
  it('maps 0 to 50 (neutral)', () => expect(normalizeInteractionScore(0)).toBe(50));
  it('maps +20 to 100 and clamps above', () => {
    expect(normalizeInteractionScore(20)).toBe(100);
    expect(normalizeInteractionScore(999)).toBe(100);
  });
  it('maps -20 to 0 and clamps below', () => {
    expect(normalizeInteractionScore(-20)).toBe(0);
    expect(normalizeInteractionScore(-999)).toBe(0);
  });
});

describe('computeCvSimilarity / compositeEmbedding', () => {
  // Skills text is folded into `description` (see text.ts) — only two
  // fields get embedded and compared now, title and description.
  const perfect: FieldEmbeddings = { title: [1, 0], description: [1, 0] };
  const opposite: FieldEmbeddings = { title: [-1, 0], description: [-1, 0] };

  it('scores a perfect match at 100 combined', () => {
    expect(computeCvSimilarity(perfect, perfect).combined).toBe(100);
  });
  it('scores a total mismatch at 0 combined', () => {
    expect(computeCvSimilarity(perfect, opposite).combined).toBe(0);
  });
  it('weights description (which includes skills text) more heavily than title', () => {
    // Only the title field matches; description is orthogonal (50%).
    const partial: FieldEmbeddings = { title: [1, 0], description: [0, 1] };
    const onlyTitleMatches = computeCvSimilarity(perfect, partial);
    // 100*0.35 + 50*0.65 = 35 + 32.5 = 67.5 -> rounds to 68 or 67
    expect(onlyTitleMatches.combined).toBeGreaterThanOrEqual(66);
    expect(onlyTitleMatches.combined).toBeLessThanOrEqual(69);
  });
  it('composite embedding averages the fields', () => {
    const composite = compositeEmbedding(perfect);
    expect(composite).toEqual([1, 0]);
  });
  it('composite embedding is empty when no fields are populated', () => {
    expect(compositeEmbedding({ title: [], description: [] })).toEqual([]);
  });
});

describe('similarityToLikedJobs', () => {
  it('returns 0 and no match when there are no liked jobs', () => {
    const result = similarityToLikedJobs([1, 0], []);
    expect(result.similarity).toBe(0);
    expect(result.best).toBeUndefined();
  });
  it('picks the closest liked job as the explanation match', () => {
    const result = similarityToLikedJobs([1, 0], [
      { jobId: 'a', title: 'Far', composite: [0, 1] },
      { jobId: 'b', title: 'Close', composite: [0.9, 0.1] },
    ]);
    expect(result.best?.jobId).toBe('b');
    expect(result.similarity).toBeGreaterThan(50);
  });
});

describe('applyMostRecentSuppression', () => {
  it('does NOT floor the score when the most recent interaction is DISMISSED — it removes the job from the pool instead (see RecLabService.rank())', () => {
    const interactions = [
      { weight: 8, createdAt: new Date('2026-01-01'), type: 'APPLIED' as const },
      { weight: -6, createdAt: new Date('2026-01-05'), type: 'DISMISSED' as const },
    ];
    const raw = 9; // e.g. +8 applied, -6 dismissed = net +2, but this raw value is a stand-in
    expect(applyMostRecentSuppression(interactions, raw)).toBe(raw);
  });

  it('floors the score when the most recent interaction is LESS_LIKE_THIS', () => {
    const interactions = [
      { weight: 5, createdAt: new Date('2026-01-01'), type: 'SAVED' as const },
      { weight: -8, createdAt: new Date('2026-01-05'), type: 'LESS_LIKE_THIS' as const },
    ];
    expect(applyMostRecentSuppression(interactions, 3)).toBe(SUPPRESSED_SCORE_FLOOR);
  });

  it('leaves the score untouched when the most recent interaction is positive', () => {
    const interactions = [
      { weight: -6, createdAt: new Date('2026-01-01'), type: 'DISMISSED' as const },
      { weight: 8, createdAt: new Date('2026-01-05'), type: 'APPLIED' as const },
    ];
    expect(applyMostRecentSuppression(interactions, 2)).toBe(2);
  });

  it('is order-independent — finds the true most recent regardless of array order', () => {
    const interactions = [
      { weight: -8, createdAt: new Date('2026-01-05'), type: 'LESS_LIKE_THIS' as const },
      { weight: 8, createdAt: new Date('2026-01-01'), type: 'APPLIED' as const },
    ];
    // Same events as the LESS_LIKE_THIS test above but listed newest-first — should still suppress.
    expect(applyMostRecentSuppression(interactions, 0)).toBe(SUPPRESSED_SCORE_FLOOR);
  });

  it('never raises a score that was already below the floor', () => {
    const interactions = [{ weight: -8, createdAt: new Date(), type: 'LESS_LIKE_THIS' as const }];
    expect(applyMostRecentSuppression(interactions, -50)).toBe(-50);
  });

  it('returns the raw score unchanged for an empty interaction list', () => {
    expect(applyMostRecentSuppression([], 42)).toBe(42);
  });

  it('LESS_LIKE_THIS is the only suppression type; DISMISSED and LESS_LIKE_THIS both propagate', () => {
    expect(SUPPRESSION_TYPES).toEqual(['LESS_LIKE_THIS']);
    expect(NEGATIVE_PROPAGATION_TYPES).toEqual(expect.arrayContaining(['DISMISSED', 'LESS_LIKE_THIS']));
    expect(NEGATIVE_PROPAGATION_TYPES).toHaveLength(2);
  });
});

describe('rankCandidates', () => {
  function makeCandidates(n: number): Candidate<{ id: string }>[] {
    return Array.from({ length: n }, (_, i) => ({
      job: { id: `job-${i}` },
      cvSimilarity: { title: 0, description: 0, combined: 100 - i * 4 },
      likedSimilarity: 50,
      dislikedSimilarity: 0,
      interactionScoreRaw: 0,
      interactionCount: 0,
    }));
  }

  it('returns the requested limit with exactly the configured novelty share', () => {
    const ranked = rankCandidates(makeCandidates(20), { limit: 10, noveltyRate: 0.2 });
    expect(ranked).toHaveLength(10);
    expect(ranked.filter(r => r.novelty)).toHaveLength(2);
    expect(ranked.filter(r => !r.novelty)).toHaveLength(8);
  });

  it('sorts the top (non-novelty) section by final score descending', () => {
    const ranked = rankCandidates(makeCandidates(20), { limit: 10, noveltyRate: 0.2 });
    const top = ranked.filter(r => !r.novelty);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].finalScore).toBeGreaterThanOrEqual(top[i].finalScore);
    }
  });

  it('never lets a novelty pick duplicate a top pick', () => {
    const ranked = rankCandidates(makeCandidates(20), { limit: 10, noveltyRate: 0.2 });
    const topIds = new Set(ranked.filter(r => !r.novelty).map(r => r.job.id));
    const noveltyIds = ranked.filter(r => r.novelty).map(r => r.job.id);
    expect(noveltyIds.every(id => !topIds.has(id))).toBe(true);
  });

  it('never fabricates candidates beyond what was given', () => {
    const ranked = rankCandidates(makeCandidates(3), { limit: 10, noveltyRate: 0.2 });
    expect(ranked).toHaveLength(3);
  });

  it('returns an empty array for an empty candidate list', () => {
    expect(rankCandidates([], { limit: 10 })).toEqual([]);
  });

  it('disables novelty picks when noveltyRate is 0', () => {
    const ranked = rankCandidates(makeCandidates(20), { limit: 10, noveltyRate: 0 });
    expect(ranked.every(r => !r.novelty)).toBe(true);
  });

  it('respects the minNoveltyScore floor — no novelty picks if nothing clears it', () => {
    const ranked = rankCandidates(makeCandidates(20), { limit: 10, noveltyRate: 0.2, minNoveltyScore: 1000 });
    expect(ranked.filter(r => r.novelty)).toHaveLength(0);
  });

  it('dislikedSimilarity of 0 leaves a candidate unaffected', () => {
    const [withZeroDislike] = rankCandidates([{
      job: { id: 'a' },
      cvSimilarity: { title: 0, description: 0, combined: 80 },
      likedSimilarity: 0,
      dislikedSimilarity: 0,
      interactionScoreRaw: 0,
      interactionCount: 0,
    }]);
    // 80 * 0.45 + 0 * 0.25 + 50(neutral) * 0.3 = 36 + 0 + 15 = 51
    expect(withZeroDislike.finalScore).toBe(51);
  });

  it('docks a candidate that resembles something the user said less-like-this to', () => {
    const base: Omit<Candidate<{ id: string }>, 'dislikedSimilarity'> = {
      job: { id: 'a' },
      cvSimilarity: { title: 0, description: 0, combined: 80 },
      likedSimilarity: 0,
      interactionScoreRaw: 0,
      interactionCount: 0,
    };
    const [noDislike] = rankCandidates([{ ...base, dislikedSimilarity: 0 }]);
    const [fullyDisliked] = rankCandidates([{ ...base, dislikedSimilarity: 100 }]);
    expect(fullyDisliked.finalScore).toBeLessThan(noDislike.finalScore);
    expect(noDislike.finalScore - fullyDisliked.finalScore).toBe(Math.round(100 * DISLIKE_PENALTY_WEIGHT));
  });

  it('two otherwise-identical candidates rank by dislikedSimilarity when everything else ties', () => {
    const ranked = rankCandidates([
      {
        job: { id: 'resembles-disliked' },
        cvSimilarity: { title: 0, description: 0, combined: 80 },
        likedSimilarity: 50, dislikedSimilarity: 90,
        interactionScoreRaw: 0, interactionCount: 0,
      },
      {
        job: { id: 'clean' },
        cvSimilarity: { title: 0, description: 0, combined: 80 },
        likedSimilarity: 50, dislikedSimilarity: 0,
        interactionScoreRaw: 0, interactionCount: 0,
      },
    ], { noveltyRate: 0 });
    expect(ranked[0].job.id).toBe('clean');
    expect(ranked[1].job.id).toBe('resembles-disliked');
  });
});
