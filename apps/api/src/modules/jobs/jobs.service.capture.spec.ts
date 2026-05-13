import { BadRequestException } from '@nestjs/common';
import { JobsService } from './jobs.service';

/**
 * Tests for `JobsService.captureJob`. Other JobsService dependencies are
 * stubbed since they aren't exercised by the capture path.
 */
describe('JobsService.captureJob', () => {
  function makeService(prismaOverrides: any = {}) {
    const userUpsert = jest.fn().mockResolvedValue({ id: 'dev-user' });
    const savedJobUpsert = jest.fn().mockResolvedValue({});
    const prisma: any = {
      user: { upsert: userUpsert },
      savedJob: {
        upsert: savedJobUpsert,
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      cvProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      dismissedJob: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      jobFeedWeights: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
      ...prismaOverrides,
    };

    // The rest of these collaborators are unused in the capture path.
    const service = new JobsService(
      {} as any, // adzuna
      {} as any, // jsearch
      {} as any, // aiFilter
      {} as any, // enrichment
      {} as any, // cache
      prisma,
    );
    return { service, prisma, userUpsert, savedJobUpsert };
  }

  it('rejects missing fields', async () => {
    const { service } = makeService();
    await expect(
      service.captureJob({ title: '', company: '', url: '' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('builds a manual Job and writes it to SavedJob', async () => {
    const { service, savedJobUpsert, userUpsert } = makeService();

    const job = await service.captureJob({
      title: 'Senior Frontend Engineer',
      company: 'Acme Inc.',
      url: 'https://example.com/careers/123',
      location: 'San Francisco, CA',
      remote: true,
      salaryMin: 150000,
      salaryMax: 200000,
      description: 'Build cool things.',
      sourceHost: 'example.com',
      extractor: 'linkedin',
    });

    expect(userUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'dev-user' },
    }));
    expect(savedJobUpsert).toHaveBeenCalledTimes(1);

    expect(job).toMatchObject({
      source: 'manual',
      title: 'Senior Frontend Engineer',
      company: 'Acme Inc.',
      url: 'https://example.com/careers/123',
      remote: true,
      status: 'saved',
    });
    expect(job.salary).toEqual({
      min: 150000,
      max: 200000,
      currency: 'USD',
      period: undefined,
    });
    expect(job.id).toMatch(/^manual-/);
    expect(job.externalId).toHaveLength(16); // sha1 prefix
  });

  it('is idempotent for the same URL (stable externalId)', async () => {
    const { service, savedJobUpsert } = makeService();
    const a = await service.captureJob({
      title: 'A', company: 'B', url: 'https://x.test/job',
    });
    const b = await service.captureJob({
      title: 'A', company: 'B', url: 'https://x.test/job',
    });
    expect(a.externalId).toEqual(b.externalId);

    // Both calls hit upsert with the same key.
    const calls = savedJobUpsert.mock.calls;
    expect(calls[0][0].where.userId_externalId_source.externalId)
      .toEqual(calls[1][0].where.userId_externalId_source.externalId);
  });

  it('infers remote from title when location is empty', async () => {
    const { service } = makeService();
    const job = await service.captureJob({
      title: 'Senior Engineer (Remote)',
      company: 'Acme',
      url: 'https://acme.test/job/9',
    });
    expect(job.remote).toBe(true);
    expect(job.location.displayName).toBe('Remote');
  });
});
