import { useState, useEffect } from 'react';
import type { Job } from '@apcomp/types';

const API = 'http://localhost:3000';

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/jobs/recommended`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setJobs(data);
      })
      .catch(() => {});
  }, []);

  return { jobs, loading };
}
