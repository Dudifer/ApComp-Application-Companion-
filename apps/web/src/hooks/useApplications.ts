import { useState, useEffect } from 'react';

const API = 'http://localhost:3000';

export interface Application {
  id: string;
  company: string;
  position?: string;
  status: string;
  appliedAt: string;
  updatedAt: string;
  lastEmailSubject?: string;
  lastEmailDate?: string;
  isAutoRejected: boolean;
}

export const STATUS_CONFIG: Record<string, { label: string; colorClass: string }> = {
  SUBMITTED:  { label: 'Submitted',  colorClass: 'status-applied' },
  APPLIED:    { label: 'Applied',    colorClass: 'status-applied' },
  VIEWED:     { label: 'Viewed',     colorClass: 'status-phone' },
  ASSESSMENT: { label: 'Assessment', colorClass: 'status-tech' },
  INTERVIEW:  { label: 'Interview',  colorClass: 'status-tech' },
  OFFER:      { label: 'Offer',      colorClass: 'status-offer' },
  REJECTED:   { label: 'Rejected',   colorClass: 'status-rejected' },
  WITHDRAWN:  { label: 'Withdrawn',  colorClass: 'status-applied' },
  DISMISSED: { label: 'Dismissed', colorClass: 'status-unknown' },
};

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    // Check Gmail connection status
    fetch(`${API}/applications/gmail/status`)
      .then(r => r.json())
      .then(data => setGmailConnected(data.connected))
      .catch(() => {});

    // Fetch dashboard applications
    fetch(`${API}/applications/dashboard`)
      .then(r => r.json())
      .then(data => { setApplications(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const connectGmail = async () => {
    const res = await fetch(`${API}/applications/gmail/auth`);
    const { url } = await res.json();
    window.location.href = url;
  };

  return { applications, loading, gmailConnected, connectGmail };
}
