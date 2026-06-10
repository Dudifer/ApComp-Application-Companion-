import { useState, useEffect } from 'react';
import type { Job } from '@apcomp/types';
import { useApi } from '../lib/api';

export function useJobs() {
  const api = useApi();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/jobs/recommended')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setJobs(data);
      })
      .catch(() => {});
  }, [api]);
  // }, []);
  
  return { jobs, loading };
}
