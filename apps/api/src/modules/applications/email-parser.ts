export type ApplicationStatus =
  | 'SUBMITTED'
  | 'VIEWED'
  | 'INTERVIEW'
  | 'ASSESSMENT'
  | 'OFFER'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'UNKNOWN';

interface StatusRule {
  status: ApplicationStatus;
  keywords: string[];
  priority: number; // higher = checked first
}

const STATUS_RULES: StatusRule[] = [
  {
    status: 'OFFER',
    priority: 100,
    keywords: [
      'pleased to offer',
      'offer letter',
      'we are excited to offer',
      'job offer',
      'formal offer',
      'offer of employment',
      'compensation package',
      'we would like to offer you',
      'extending an offer',
      'offer of the position',
    ],
  },
  {
    status: 'REJECTED',
    priority: 90,
    keywords: [
      'unfortunately',
      'not moving forward',
      'decided to move forward with other',
      'other candidates',
      'not selected',
      'position has been filled',
      'pursue other candidates',
      "we won't be moving",
      'not a fit',
      'regret to inform',
      'after careful consideration',
      'decided not to',
      'will not be moving forward',
      'not be proceeding',
      'chosen to move forward with',
      'selected other candidates',
      'not be advancing',
      'not be continuing',
    ],
  },
  {
    status: 'WITHDRAWN',
    priority: 85,
    keywords: [
      'position is no longer available',
      'role has been filled',
      'we have paused hiring',
      'position has been put on hold',
      'role is no longer open',
      'position was cancelled',
      'withdrawn the job posting',
      'closing this position',
    ],
  },
  {
    status: 'INTERVIEW',
    priority: 80,
    keywords: [
      'interview',
      "we'd like to schedule",
      'schedule a call',
      'phone screen',
      'zoom call',
      'meet with our team',
      'next steps',
      'move forward',
      'moving you forward',
      'pleased to invite',
      'we would like to speak',
      'schedule time',
      'set up a call',
      'connect with you',
      'speak with you further',
      'have a conversation',
      'virtual meeting',
      'video call',
      'onsite interview',
      'on-site interview',
      'technical interview',
      'hiring manager',
      'we were impressed',
    ],
  },
  {
    status: 'ASSESSMENT',
    priority: 70,
    keywords: [
      'assessment',
      'coding challenge',
      'take-home',
      'take home assignment',
      'technical test',
      'skills test',
      'hackerrank',
      'codility',
      'test your skills',
      'complete the following',
      'technical assessment',
      'coding test',
      'programming challenge',
      'assignment attached',
    ],
  },
  {
    status: 'VIEWED',
    priority: 60,
    keywords: [
      'your application was viewed',
      'recruiter viewed',
      'someone viewed your application',
      'your profile was viewed',
      'application has been reviewed',
    ],
  },
  {
    status: 'SUBMITTED',
    priority: 50,
    keywords: [
      'thank you for applying',
      'application received',
      'thanks for your application',
      'received your application',
      'application submitted',
      'successfully applied',
      'your application for',
      'application confirmation',
      'we have received your',
      'thank you for your interest',
      'your resume has been received',
      'application has been submitted',
      'completed your application',
      'you have applied',
      'application was submitted',
      'received your resume',
    ],
  },
];

export interface ParsedEmail {
  status: ApplicationStatus;
  company: string;
  position?: string;
  emailDate: Date;
  subject: string;
  matchedKeyword?: string;
}

/**
 * Detect application status from email subject + body
 */
export function detectStatus(subject: string, body: string): { status: ApplicationStatus; keyword?: string } {
  const text = `${subject} ${body}`.toLowerCase();

  // Check rules in priority order
  const sorted = [...STATUS_RULES].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    for (const keyword of rule.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return { status: rule.status, keyword };
      }
    }
  }

  return { status: 'UNKNOWN' };
}

/**
 * Extract company name from email sender or subject
 * e.g. "careers@stripe.com" → "Stripe"
 * e.g. "no-reply@greenhouse.io on behalf of Vercel" → "Vercel"
 */
export function extractCompany(from: string, subject: string): string {
  // Try "on behalf of CompanyName" pattern
  const onBehalf = from.match(/on behalf of ([^<]+)/i);
  if (onBehalf) return onBehalf[1].trim();

  // Try to extract from email domain
  const emailMatch = from.match(/@([^.>]+)\./);
  if (emailMatch) {
    const domain = emailMatch[1].toLowerCase();
    // Skip common job board / ATS domains
    const skipDomains = [
      'greenhouse', 'lever', 'workday', 'taleo', 'jobvite',
      'smartrecruiters', 'icims', 'brassring', 'successfactors',
      'gmail', 'yahoo', 'outlook', 'hotmail', 'noreply',
      'notifications', 'mailer', 'bounce', 'sendgrid', 'mailgun',
    ];
    if (!skipDomains.includes(domain)) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }

  // Try subject line: "Your application to CompanyName"
  const subjectPatterns = [
    /application (?:to|at|with|for) ([A-Z][a-zA-Z\s&,.']+?)(?:\s*[-–|]|\s*for\s|\s*position|\s*role|$)/,
    /(?:from|at) ([A-Z][a-zA-Z\s&,.']+?)(?:\s*[-–|]|$)/,
    /([A-Z][a-zA-Z\s&,.']+?) (?:is reviewing|has received|wants to)/,
  ];

  for (const pattern of subjectPatterns) {
    const match = subject.match(pattern);
    if (match) return match[1].trim();
  }

  return 'Unknown Company';
}

/**
 * Extract job position from subject line
 */
export function extractPosition(subject: string): string | undefined {
  const patterns = [
    /(?:for the |for |position of |role of )([^-–|]+?)(?:\s*[-–|]|$|\s*at\s|\s*position)/i,
    /application.*?[:-]\s*([^-–|]+?)(?:\s*[-–|]|$)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:position|role|job|opportunity)/i,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      const pos = match[1].trim();
      if (pos.length > 3 && pos.length < 80) return pos;
    }
  }

  return undefined;
}
