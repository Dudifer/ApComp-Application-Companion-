import { CvProfile, Job } from '@apcomp/types';
import { ApplicationStatus } from '../../../generated/prisma';

// ─────────────────────────────────────────────────────────────────────────
// Demo CV profile — Jacob Nyberg's real resume, structured the same way the
// AI extractor (ai-extractor.service.ts) would produce it from the uploaded
// PDF. Hand-built once here instead of re-running the extractor on every
// reset: it's deterministic, costs no Anthropic API calls, and the shape is
// identical to what a real CV upload stores in CvProfile.
// ─────────────────────────────────────────────────────────────────────────

const RAW_TEXT = `Jacob Nyberg
Software Developer
319-541-3440 | jacob.6nyberg@gmail.com | linkedin.com/in/jacob-nyberg/ | github.com/dudifer

About Me
Full-stack software developer with hands-on experience across web applications, data pipelines, and applied machine learning. Comfortable moving between React/TypeScript frontends, NestJS/Python backends, and SQL-backed data layers, with a track record of shipping complete features end-to-end — from OAuth integrations to AI-assisted parsing pipelines to computer-vision inference services.

Education
University of Iowa
Computer Science (BA) - Graduated with Honors
Jan 2021 - May 2025

Work Experience

Junior Developer
Revature — Holly Springs, NC (Remote)
Aug 2025 - Dec 2025
• Contributed to feature expansion and maintenance of an online library system.
• Participated in weekly meetings discussing progress on deliverables and establishing new sprint benchmarks.
• Completed professional development training in Java, Spring Boot, and SQL.
Technologies: Git, GitHub, Java, Spring Boot, SQL

Junior Developer
University of Iowa Libraries Digital Studio — Iowa City, IA
Sep 2023 - Jun 2025
• Designed, developed, and documented the touchscreen application installed at the main entrance of the UI Main Library, promoting doctoral research and visitor engagement with library spaces and campus activities.
• Established, dumped, and restored SQL databases.
• Deployed, maintained, and migrated public-facing applications.
• Used Ansible to automate remote server updates for Omeka websites.
• Implemented SEO strategies on Studio websites and built a dashboard to measure and visualize past and present performance metrics.
Technologies: Git, Bash, GitHub, VS Code, AWS EC2, Python, JavaScript, HTML, SQL, Google Search Console, Ansible, YAML, Godot, GDScript

App Developer
Liminal Education Consultant — Roseville, CA (Remote)
Jun 2024 - Aug 2024
• Designed and developed software to collect, analyze, and communicate performance-related data for organizational and team-based use cases.
• Partnered with stakeholders throughout development cycles to refine functionality, usability, and product direction in alignment with user and business needs.
Technologies: Git, GitHub, VS Code, Python, FastAPI

Research Assistant / Ambassador
University of Iowa Computational Epidemiology Research Group — Iowa City, IA
Jun 2023 - Aug 2023
• Led development of an object-oriented, agent-based SIRS disease model to simulate transmission of airborne diseases in healthcare settings.
• Queried a SQL database containing tens of millions of entries to build ordered, themed datasets validating simulation effectiveness and studying the impact of facility structure and staff schedules on disease transmission.
• Provided technical guidance, mentorship, and onboarding support for undergraduate researchers.
• Participated in weekly meetings reporting project progress and discussing outcomes and deliverables.
Technologies: Git, Bash, GitHub, VS Code, Python, SQL, Pandas, NumPy

Personal Projects

Application Companion (ApComp) | Chrome Extension, Monorepo — Spring 2026
• Architected a full-stack monorepo, separating concerns across a React/Vite frontend, NestJS REST API backend, and shared type packages.
• Provisioned and maintained a database supporting multi-user data persistence for applications, jobs, CV profiles, and job recommendation weights and interaction scoring.
• Implemented a Gmail OAuth2 integration that scrapes job application emails on page visit, parsing them into status categories using keyword matching.
• Built a job recommendation engine that queries and scores job relevance with a dismissal-based feedback loop that rescores jobs over time.
• Developed a CV parsing pipeline using the Anthropic API to extract structured experience profiles from uploaded PDF and DOCX files, with an interactive gap-filling Q&A flow to resolve missing technical detail.
• Created a resume builder page with live PDF preview, supporting inline editing, bullet-level toggling, and keyword-based automatic tailoring toward a target job description.
• Developed a Chrome extension to gather company and job descriptions, tailor which projects to feature on a resume accordingly, and auto-fill application information based on stored CV data.
• Deployed the application to an AWS EC2 instance, tunneling the connection to a custom domain via Cloudflare.
Technologies: Git, Bash, GitHub, VS Code, Docker, Cloudflare, AWS EC2, TypeScript, SQL, React, Node.js, NestJS, PostgreSQL, Prisma, Clerk API, Google Search Console API, Anthropic API, Storybook, Jest

Vehicle Detection | Cloud Computing & OpenCV — Winter 2025/2026
• Drew diagrams describing system components, their functions, and their interactions.
• Implemented a trained inference AI network to detect and log vehicles from roadside traffic footage into a SQL database.
• Created a REST API backend exposing endpoints for full-video inference, live MJPEG frame streaming, and annotated video download.
• Developed a desktop client interface that streams annotated frames in real time and presents post-inference detection class resolution.
Technologies: Git, GitHub, VS Code, Docker, AWS EC2, Python, SQL, FastAPI, Pytest

Disaster Relief Program | Full-Stack SDLC & Ticket-Handling — Spring 2025
• Used Agile-Scrum development methodology to engineer a ticket-style disaster relief coordination platform matching donor pledges to aid requests using severity scoring and perishability-aware delivery constraints.
• Integrated reviewer tooling for auditing request legitimacy, monitoring unresolved aid tickets, and managing conflicting or overlapping relief requests.
• Formulated a SQL-backed persistence layer for donation pledges, requester profiles, aid requests, review workflows, and fulfillment tracking across multiple concurrent users.
• Provisioned SQL database functions for updating and maintaining tables.
Technologies: Git, GitHub, VS Code, Python, React, Django, Pytest, Storybook, SQL

Remote Voting App | Full-Stack SDLC & OOP — Fall 2024
• Drew diagrams describing system components, their functions, and their interactions.
• Established strong testing coverage to define capacity and functionality.
• Developed a website for local and national government officials to conduct secure polling for their constituents.
• Conducted frequent meetings with stakeholders to ensure product deliverables met expectations.
Technologies: Git, GitHub, VS Code, Java, JavaScript, SQL, Node.js, AngularJS, Jest, Storybook, PostgreSQL

Stock Price Predictor | LSTM & Data Preprocessing — Fall 2023
• Pulled, processed, and transformed current and historical GOOGL stock data into series datasets.
• Constructed and trained an LSTM network on processed data to predict the net change from open to close on a given day with high accuracy (99% CL, $1.25 CI).
• Created an interface to display and report prediction accuracy.
Technologies: Git, GitHub, VS Code, Python, PyTorch, Pandas, NumPy

Pong Autonomous Agent | Predictive Modeling & Control — Spring 2023
• Engineered a 2D dynamic collision environment with human- and computer-controlled players.
• Used linear regression on positional game data to predict ball trajectory and intercept coordinates in real time, producing a computer opponent with near-perfect interception accuracy.
Technologies: VS Code, Python, Tkinter, scikit-learn

Iris Flower Identification | Computer Vision & Machine Learning — Fall 2022
• Gathered over 10,000 descriptors of unique iris setosa, versicolor, and virginica flowers.
• Preprocessed and transformed the dataset into training, validation, and testing sets.
• Trained a neural network to identify iris subspecies at over 99% accuracy.
Technologies: Git, GitHub, VS Code, Python, PyTorch, scikit-learn, NumPy

Additional Experience
LeetCode: 115+ Problems Solved — Python (82), Java (15), C# (10), C++ (8)
`;

export const DEMO_CV_PROFILE: CvProfile = {
  name: 'Jacob Nyberg',
  email: 'jacob.6nyberg@gmail.com',
  rawText: RAW_TEXT,
  isComplete: true,
  gapQuestions: [],
  practices: [
    'Agile/Scrum',
    'Code Review',
    'Automated Testing (Pytest/Jest)',
    'CI/CD Deployment',
    'Technical Mentorship',
    'SEO Optimization',
  ],
  education: [
    {
      school: 'University of Iowa',
      degree: 'Bachelor of Arts',
      field: 'Computer Science',
      startDate: '2021-01',
      endDate: '2025-05',
      location: 'Iowa City, IA',
      honors: ['Graduated with Honors'],
    },
  ],
  roles: [
    {
      company: 'Revature',
      title: 'Junior Developer',
      startDate: '2025-08',
      endDate: '2025-12',
      durationMonths: 5,
      technologies: ['Java', 'Spring Boot', 'SQL', 'Git', 'GitHub'],
      practices: ['agile ceremonies', 'sprint planning', 'professional development training'],
      description:
        '• Contributed to feature expansion and maintenance of an online library system.\n' +
        '• Participated in weekly meetings discussing progress on deliverables and establishing new sprint benchmarks.\n' +
        '• Completed professional development training in Java, Spring Boot, and SQL.',
    },
    {
      company: 'University of Iowa Libraries Digital Studio',
      title: 'Junior Developer',
      startDate: '2023-09',
      endDate: '2025-06',
      durationMonths: 21,
      technologies: [
        'Git', 'Bash', 'GitHub', 'VS Code', 'AWS EC2', 'Python', 'JavaScript',
        'HTML', 'SQL', 'Google Search Console', 'Ansible', 'YAML', 'Godot', 'GDScript',
      ],
      practices: ['infrastructure automation', 'SEO optimization', 'analytics dashboarding'],
      description:
        '• Designed, developed, and documented the touchscreen application installed at the main entrance of the UI Main Library, promoting doctoral research and visitor engagement with library spaces and campus activities.\n' +
        '• Established, dumped, and restored SQL databases.\n' +
        '• Deployed, maintained, and migrated public-facing applications.\n' +
        '• Used Ansible to automate remote server updates for Omeka websites.\n' +
        '• Implemented SEO strategies on Studio websites and built a dashboard to measure and visualize past and present performance metrics.',
    },
    {
      company: 'Liminal Education Consultant',
      title: 'App Developer',
      startDate: '2024-06',
      endDate: '2024-08',
      durationMonths: 3,
      technologies: ['Git', 'GitHub', 'VS Code', 'Python', 'FastAPI'],
      practices: ['stakeholder collaboration', 'iterative development'],
      description:
        '• Designed and developed software to collect, analyze, and communicate performance-related data for organizational and team-based use cases.\n' +
        '• Partnered with stakeholders throughout development cycles to refine functionality, usability, and product direction in alignment with user and business needs.',
    },
    {
      company: 'University of Iowa Computational Epidemiology Research Group',
      title: 'Research Assistant / Ambassador',
      startDate: '2023-06',
      endDate: '2023-08',
      durationMonths: 3,
      technologies: ['Git', 'Bash', 'GitHub', 'VS Code', 'Python', 'SQL', 'Pandas', 'NumPy'],
      practices: ['mentorship', 'empirical validation', 'research collaboration'],
      description:
        '• Led development of an object-oriented, agent-based SIRS disease model to simulate transmission of airborne diseases in healthcare settings.\n' +
        '• Queried a SQL database containing tens of millions of entries to build ordered, themed datasets validating simulation effectiveness and studying the impact of facility structure and staff schedules on disease transmission.\n' +
        '• Provided technical guidance, mentorship, and onboarding support for undergraduate researchers.\n' +
        '• Participated in weekly meetings reporting project progress and discussing outcomes and deliverables.',
    },
  ],
  projects: [
    {
      name: 'Application Companion (ApComp)',
      category: 'Chrome Extension, Monorepo',
      date: 'Spring 2026',
      techStack: 'Git - Bash - GitHub - VS Code - Docker - Cloudflare - AWS EC2 - TypeScript - SQL - React - Node.js - NestJS - PostgreSQL - Prisma - Clerk API - Anthropic API - Storybook - Jest',
      bullets: [
        'Architected a full-stack monorepo, separating concerns across a React/Vite frontend, NestJS REST API backend, and shared type packages.',
        'Provisioned and maintained a database supporting multi-user data persistence for applications, jobs, CV profiles, and job recommendation weights and interaction scoring.',
        'Implemented a Gmail OAuth2 integration that scrapes job application emails on page visit, parsing them into status categories using keyword matching.',
        'Built a job recommendation engine that queries and scores job relevance with a dismissal-based feedback loop that rescores jobs over time.',
        'Developed a CV parsing pipeline using the Anthropic API to extract structured experience profiles from uploaded PDF and DOCX files, with an interactive gap-filling Q&A flow to resolve missing technical detail.',
        'Created a resume builder page with live PDF preview, supporting inline editing, bullet-level toggling, and keyword-based automatic tailoring toward a target job description.',
        'Developed a Chrome extension to gather company and job descriptions, tailor which projects to feature on a resume accordingly, and auto-fill application information based on stored CV data.',
        'Deployed the application to an AWS EC2 instance, tunneling the connection to a custom domain via Cloudflare.',
      ],
    },
    {
      name: 'Vehicle Detection',
      category: 'Cloud Computing & OpenCV',
      date: 'Winter 2025/2026',
      techStack: 'Git - GitHub - VS Code - Docker - AWS EC2 - Python - SQL - FastAPI - Pytest',
      bullets: [
        'Drew diagrams describing system components, their functions, and their interactions.',
        'Implemented a trained inference AI network to detect and log vehicles from roadside traffic footage into a SQL database.',
        'Created a REST API backend exposing endpoints for full-video inference, live MJPEG frame streaming, and annotated video download.',
        'Developed a desktop client interface that streams annotated frames in real time and presents post-inference detection class resolution.',
      ],
    },
    {
      name: 'Disaster Relief Program',
      category: 'Full-Stack SDLC & Ticket-Handling',
      date: 'Spring 2025',
      techStack: 'Git - GitHub - VS Code - Python - React - Django - Pytest - Storybook - SQL',
      bullets: [
        'Used Agile-Scrum development methodology to engineer a ticket-style disaster relief coordination platform matching donor pledges to aid requests using severity scoring and perishability-aware delivery constraints.',
        'Integrated reviewer tooling for auditing request legitimacy, monitoring unresolved aid tickets, and managing conflicting or overlapping relief requests.',
        'Formulated a SQL-backed persistence layer for donation pledges, requester profiles, aid requests, review workflows, and fulfillment tracking across multiple concurrent users.',
        'Provisioned SQL database functions for updating and maintaining tables.',
      ],
    },
    {
      name: 'Remote Voting App',
      category: 'Full-Stack SDLC & OOP',
      date: 'Fall 2024',
      techStack: 'Git - GitHub - VS Code - Java - JavaScript - SQL - Node.js - AngularJS - Jest - Storybook - PostgreSQL',
      bullets: [
        'Drew diagrams describing system components, their functions, and their interactions.',
        'Established strong testing coverage to define capacity and functionality.',
        'Developed a website for local and national government officials to conduct secure polling for their constituents.',
        'Conducted frequent meetings with stakeholders to ensure product deliverables met expectations.',
      ],
    },
    {
      name: 'Stock Price Predictor',
      category: 'LSTM & Data Preprocessing',
      date: 'Fall 2023',
      techStack: 'Git - GitHub - VS Code - Python - PyTorch - Pandas - NumPy',
      bullets: [
        'Pulled, processed, and transformed current and historical GOOGL stock data into series datasets.',
        'Constructed and trained an LSTM network on processed data to predict the net change from open to close on a given day with high accuracy (99% CL, $1.25 CI).',
        'Created an interface to display and report prediction accuracy.',
      ],
    },
    {
      name: 'Pong Autonomous Agent',
      category: 'Predictive Modeling & Control',
      date: 'Spring 2023',
      techStack: 'VS Code - Python - Tkinter - scikit-learn',
      bullets: [
        'Engineered a 2D dynamic collision environment with human- and computer-controlled players.',
        'Used linear regression on positional game data to predict ball trajectory and intercept coordinates in real time, producing a computer opponent with near-perfect interception accuracy.',
      ],
    },
    {
      name: 'Iris Flower Identification',
      category: 'Computer Vision & Machine Learning',
      date: 'Fall 2022',
      techStack: 'Git - GitHub - VS Code - Python - PyTorch - scikit-learn - NumPy',
      bullets: [
        'Gathered over 10,000 descriptors of unique iris setosa, versicolor, and virginica flowers.',
        'Preprocessed and transformed the dataset into training, validation, and testing sets.',
        'Trained a neural network to identify iris subspecies at over 99% accuracy.',
      ],
    },
  ],
  skills: [
    { name: 'TypeScript', category: 'language', monthsExperience: 8, proficiency: 'advanced', usedAt: ['Application Companion (ApComp)'] },
    { name: 'JavaScript', category: 'language', monthsExperience: 30, proficiency: 'advanced', usedAt: ['University of Iowa Libraries Digital Studio', 'Remote Voting App'] },
    { name: 'Python', category: 'language', monthsExperience: 40, proficiency: 'expert', usedAt: ['University of Iowa Libraries Digital Studio', 'Liminal Education Consultant', 'University of Iowa Computational Epidemiology Research Group', 'Vehicle Detection', 'Stock Price Predictor'] },
    { name: 'Java', category: 'language', monthsExperience: 10, proficiency: 'intermediate', usedAt: ['Revature', 'Remote Voting App'] },
    { name: 'SQL', category: 'language', monthsExperience: 40, proficiency: 'advanced', usedAt: ['Revature', 'University of Iowa Libraries Digital Studio', 'University of Iowa Computational Epidemiology Research Group'] },
    { name: 'GDScript', category: 'language', monthsExperience: 4, proficiency: 'beginner', usedAt: ['University of Iowa Libraries Digital Studio'] },
    { name: 'React', category: 'framework', monthsExperience: 12, proficiency: 'advanced', usedAt: ['Application Companion (ApComp)', 'Disaster Relief Program'] },
    { name: 'NestJS', category: 'framework', monthsExperience: 6, proficiency: 'advanced', usedAt: ['Application Companion (ApComp)'] },
    { name: 'FastAPI', category: 'framework', monthsExperience: 8, proficiency: 'advanced', usedAt: ['Liminal Education Consultant', 'Vehicle Detection'] },
    { name: 'Spring Boot', category: 'framework', monthsExperience: 5, proficiency: 'intermediate', usedAt: ['Revature'] },
    { name: 'Django', category: 'framework', monthsExperience: 3, proficiency: 'intermediate', usedAt: ['Disaster Relief Program'] },
    { name: 'PyTorch', category: 'framework', monthsExperience: 10, proficiency: 'advanced', usedAt: ['Vehicle Detection', 'Stock Price Predictor', 'Iris Flower Identification'] },
    { name: 'scikit-learn', category: 'framework', monthsExperience: 6, proficiency: 'intermediate', usedAt: ['Pong Autonomous Agent', 'Iris Flower Identification'] },
    { name: 'Git', category: 'tool', monthsExperience: 40, proficiency: 'expert', usedAt: ['Revature', 'University of Iowa Libraries Digital Studio', 'Liminal Education Consultant', 'University of Iowa Computational Epidemiology Research Group', 'Application Companion (ApComp)'] },
    { name: 'Docker', category: 'tool', monthsExperience: 8, proficiency: 'advanced', usedAt: ['Application Companion (ApComp)', 'Vehicle Detection'] },
    { name: 'AWS EC2', category: 'tool', monthsExperience: 10, proficiency: 'advanced', usedAt: ['University of Iowa Libraries Digital Studio', 'Application Companion (ApComp)', 'Vehicle Detection'] },
    { name: 'PostgreSQL', category: 'tool', monthsExperience: 8, proficiency: 'advanced', usedAt: ['Application Companion (ApComp)', 'Remote Voting App'] },
    { name: 'Prisma', category: 'tool', monthsExperience: 6, proficiency: 'advanced', usedAt: ['Application Companion (ApComp)'] },
    { name: 'Cloudflare', category: 'tool', monthsExperience: 4, proficiency: 'intermediate', usedAt: ['Application Companion (ApComp)'] },
    { name: 'Ansible', category: 'tool', monthsExperience: 5, proficiency: 'intermediate', usedAt: ['University of Iowa Libraries Digital Studio'] },
    { name: 'Pandas', category: 'tool', monthsExperience: 12, proficiency: 'advanced', usedAt: ['University of Iowa Computational Epidemiology Research Group', 'Stock Price Predictor'] },
    { name: 'NumPy', category: 'tool', monthsExperience: 12, proficiency: 'advanced', usedAt: ['University of Iowa Computational Epidemiology Research Group', 'Stock Price Predictor', 'Iris Flower Identification'] },
    { name: 'Anthropic API', category: 'tool', monthsExperience: 4, proficiency: 'intermediate', usedAt: ['Application Companion (ApComp)'] },
    { name: 'Agile/Scrum', category: 'methodology', monthsExperience: 15, proficiency: 'advanced', usedAt: ['Revature', 'Disaster Relief Program'] },
    { name: 'Automated Testing', category: 'practice', monthsExperience: 20, proficiency: 'advanced', usedAt: ['Vehicle Detection', 'Disaster Relief Program', 'Remote Voting App'] },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Demo job recommendations — fictional companies (deliberately not real
// employers) with descriptions written to overlap meaningfully with the CV
// above, so the resume tailoring algorithm (resumeTailor.ts, entirely
// client-side keyword matching) has real signal to reorder/trim against.
// ─────────────────────────────────────────────────────────────────────────

interface DemoJobSpec {
  slug: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  employmentType: string;
  description: string;
  qualifications: string[];
  responsibilities: string[];
  tags: string[];
  relevanceScore: number;
  postedDaysAgo: number;
}

const JOB_SPECS: DemoJobSpec[] = [
  {
    slug: 'northlight-fullstack-swe',
    title: 'Full-Stack Software Engineer',
    company: 'Northlight Systems',
    location: 'Remote (US)',
    remote: true,
    employmentType: 'Full-time',
    description:
      "Northlight Systems builds internal tooling for mid-market logistics companies. We're hiring a full-stack " +
      'engineer to help rebuild our customer dashboard in React and TypeScript, backed by a NestJS API and ' +
      'PostgreSQL. You will work across the whole stack, from Prisma schema design to component-level UI work, ' +
      'and pair closely with product on shipping fast without breaking things.',
    qualifications: [
      '2+ years building production web applications with React and TypeScript',
      'Experience designing REST APIs with Node.js (NestJS or Express)',
      'Comfortable with SQL schema design (PostgreSQL or similar) and an ORM such as Prisma',
      'Familiarity with Git-based workflows and code review',
    ],
    responsibilities: [
      'Build and maintain React/TypeScript features across the customer dashboard',
      'Design and implement REST endpoints in our NestJS backend',
      'Write and evolve Prisma schema migrations against PostgreSQL',
      'Participate in code review and sprint planning',
    ],
    tags: ['React', 'TypeScript', 'NestJS', 'PostgreSQL', 'Prisma', 'Full-Stack'],
    relevanceScore: 94,
    postedDaysAgo: 3,
  },
  {
    slug: 'fieldstone-backend-engineer',
    title: 'Backend Engineer (Python)',
    company: 'Fieldstone Analytics',
    location: 'Austin, TX',
    remote: false,
    employmentType: 'Full-time',
    description:
      'Fieldstone Analytics builds data pipelines for agricultural forecasting. We need a backend engineer to ' +
      'extend our FastAPI services, work with SQL-heavy data models, and help automate deployment of our ' +
      'inference jobs to AWS. Prior experience turning research code into production services is a big plus.',
    qualifications: [
      'Strong Python skills, ideally with FastAPI or a similar async framework',
      'Comfortable writing and optimizing SQL queries against large datasets',
      'Experience with AWS (EC2 or equivalent) and basic infrastructure automation (Ansible, Docker, etc.)',
      'Exposure to Pandas/NumPy for data-shape debugging',
    ],
    responsibilities: [
      'Build and extend FastAPI services that serve model predictions',
      'Write SQL migrations and queries against multi-million-row tables',
      'Automate deployment and server updates with Ansible and Docker',
      'Collaborate with the data science team on productionizing models',
    ],
    tags: ['Python', 'FastAPI', 'SQL', 'AWS', 'Ansible', 'Backend'],
    relevanceScore: 88,
    postedDaysAgo: 5,
  },
  {
    slug: 'bramble-computer-vision-engineer',
    title: 'Computer Vision Engineer',
    company: 'Bramble Robotics',
    location: 'Remote (US)',
    remote: true,
    employmentType: 'Full-time',
    description:
      'Bramble Robotics builds perception systems for warehouse robotics. We are looking for an engineer with ' +
      'hands-on PyTorch experience to help train and deploy object-detection models, and wrap them in real-time ' +
      'inference services other teams can call.',
    qualifications: [
      'Experience training and evaluating computer vision models in PyTorch',
      'Comfortable building REST APIs to serve model inference (FastAPI, Flask, or similar)',
      'Familiarity with Docker for packaging inference services',
      'Bonus: experience with real-time video/frame streaming (e.g. MJPEG)',
    ],
    responsibilities: [
      'Train and iterate on object-detection models for warehouse camera feeds',
      'Build REST endpoints exposing inference results to downstream systems',
      'Package and deploy inference services with Docker on AWS',
      'Write automated tests (Pytest) covering model and API behavior',
    ],
    tags: ['PyTorch', 'Computer Vision', 'Python', 'Docker', 'AWS'],
    relevanceScore: 91,
    postedDaysAgo: 6,
  },
  {
    slug: 'cascadia-devtools-swe',
    title: 'Software Engineer, Developer Tools',
    company: 'Cascadia Devtools',
    location: 'Seattle, WA',
    remote: false,
    employmentType: 'Full-time',
    description:
      'Cascadia Devtools makes a browser extension and CLI used by thousands of developers to automate repetitive ' +
      "web workflows. We're looking for someone who has actually shipped a browser extension before and enjoys " +
      'working across a TypeScript monorepo spanning frontend, backend, and shared packages.',
    qualifications: [
      'Experience building or shipping a Chrome/browser extension',
      'Strong TypeScript across frontend and backend contexts',
      'Comfortable working in a monorepo with shared type packages',
      'Testing discipline — Jest/Storybook or equivalent',
    ],
    responsibilities: [
      'Maintain and extend our Chrome extension and its content scripts',
      'Work across a TypeScript monorepo (React frontend, Node backend, shared types)',
      'Write Jest tests and Storybook stories for new UI components',
      'Ship incrementally with CI/CD and code review',
    ],
    tags: ['TypeScript', 'Chrome Extension', 'Monorepo', 'Jest', 'Storybook'],
    relevanceScore: 85,
    postedDaysAgo: 8,
  },
  {
    slug: 'aurora-health-data-engineer',
    title: 'Data / ML Engineer',
    company: 'Aurora Health Data',
    location: 'Remote (US)',
    remote: true,
    employmentType: 'Full-time',
    description:
      'Aurora Health Data models disease transmission risk for hospital networks. We need an engineer comfortable ' +
      'with large SQL datasets and simulation-style modeling to help extend our forecasting pipeline and turn ' +
      'research notebooks into scheduled, monitored jobs.',
    qualifications: [
      'Experience querying and transforming large SQL datasets (tens of millions of rows)',
      'Python data tooling — Pandas/NumPy at minimum',
      'Exposure to agent-based or simulation-style modeling is a strong plus',
      'Comfortable communicating findings to non-technical stakeholders',
    ],
    responsibilities: [
      'Build and maintain SQL-backed ETL pipelines for hospital network data',
      'Extend simulation models estimating disease transmission risk',
      'Turn research notebooks into scheduled, monitored production jobs',
      'Present findings and dashboards to clinical stakeholders',
    ],
    tags: ['Python', 'SQL', 'Pandas', 'Data Engineering', 'Simulation'],
    relevanceScore: 78,
    postedDaysAgo: 11,
  },
  {
    slug: 'sable-platform-engineer',
    title: 'Platform Engineer',
    company: 'Sable Cloud',
    location: 'Denver, CO',
    remote: false,
    employmentType: 'Full-time',
    description:
      "Sable Cloud runs infrastructure for a portfolio of small SaaS products. We're hiring a platform engineer to " +
      'help manage our Dockerized services on AWS EC2, tunnel traffic through Cloudflare, and keep deployments ' +
      'boring and reliable.',
    qualifications: [
      'Experience deploying and maintaining services on AWS EC2',
      'Comfortable with Docker for packaging and running services',
      'Familiarity with Cloudflare (tunnels, DNS, or workers)',
      'Bash/scripting comfort for automating routine operations',
    ],
    responsibilities: [
      'Deploy and maintain Dockerized services across AWS EC2 instances',
      'Manage Cloudflare tunnels and DNS for client-facing domains',
      'Automate routine maintenance with Bash/Ansible',
      'Support on-call rotation for infrastructure incidents',
    ],
    tags: ['AWS EC2', 'Docker', 'Cloudflare', 'Bash', 'Platform'],
    relevanceScore: 74,
    postedDaysAgo: 9,
  },
];

export function buildDemoJobs(now: Date): Job[] {
  return JOB_SPECS.map((spec): Job => {
    const postedAt = new Date(now.getTime() - spec.postedDaysAgo * 24 * 60 * 60 * 1000).toISOString();
    return {
      id: `manual-demo-${spec.slug}`,
      externalId: `demo-${spec.slug}`,
      source: 'manual',
      title: spec.title,
      company: spec.company,
      location: { displayName: spec.location },
      remote: spec.remote,
      description: spec.description,
      highlights: {
        qualifications: spec.qualifications,
        responsibilities: spec.responsibilities,
      },
      tags: spec.tags,
      url: `https://example.com/careers/${spec.slug}`,
      applyOptions: [{ publisher: spec.company, url: `https://example.com/careers/${spec.slug}`, isDirect: true }],
      applyIsDirect: true,
      contractTime: 'full_time',
      contractType: 'permanent',
      employmentType: spec.employmentType,
      publisher: spec.company,
      postedAt,
      relevanceScore: spec.relevanceScore,
      status: 'new',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Demo applications — stand in for "gmails" without touching a real inbox.
// Dates are computed relative to `now` (reset time) rather than hardcoded,
// so the dashboard's "Filed This Week" stat etc. always look current.
// ─────────────────────────────────────────────────────────────────────────

interface DemoApplicationSpec {
  company: string;
  role: string;
  status: keyof typeof ApplicationStatus;
  appliedDaysAgo: number;
  lastEmailDaysAgo: number;
  lastEmailSubject: string;
}

const APPLICATION_SPECS: DemoApplicationSpec[] = [
  {
    company: 'Northlight Systems',
    role: 'Full-Stack Software Engineer',
    status: 'INTERVIEW',
    appliedDaysAgo: 14,
    lastEmailDaysAgo: 2,
    lastEmailSubject: 'Interview confirmation — Full-Stack Software Engineer at Northlight Systems',
  },
  {
    company: 'Fieldstone Analytics',
    role: 'Backend Engineer (Python)',
    status: 'ASSESSMENT',
    appliedDaysAgo: 19,
    lastEmailDaysAgo: 6,
    lastEmailSubject: 'Next steps: technical assessment for Backend Engineer',
  },
  {
    company: 'Bramble Robotics',
    role: 'Computer Vision Engineer',
    status: 'OFFER',
    appliedDaysAgo: 32,
    lastEmailDaysAgo: 1,
    lastEmailSubject: 'Offer letter enclosed — Bramble Robotics',
  },
  {
    company: 'Cascadia Devtools',
    role: 'Software Engineer, Developer Tools',
    status: 'APPLIED',
    appliedDaysAgo: 3,
    lastEmailDaysAgo: 3,
    lastEmailSubject: "We've received your application to Cascadia Devtools",
  },
  {
    company: 'Aurora Health Data',
    role: 'Data / ML Engineer',
    status: 'REJECTED',
    appliedDaysAgo: 50,
    lastEmailDaysAgo: 21,
    lastEmailSubject: 'Update on your application to Aurora Health Data',
  },
  {
    company: 'Sable Cloud',
    role: 'Platform Engineer',
    status: 'VIEWED',
    appliedDaysAgo: 7,
    lastEmailDaysAgo: 5,
    lastEmailSubject: 'Your application has been viewed',
  },
];

export function buildDemoApplications(now: Date) {
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  return APPLICATION_SPECS.map(spec => ({
    company: spec.company,
    role: spec.role,
    status: ApplicationStatus[spec.status],
    appliedAt: daysAgo(spec.appliedDaysAgo),
    updatedAt: daysAgo(spec.lastEmailDaysAgo),
    lastEmailSubject: spec.lastEmailSubject,
    lastEmailDate: daysAgo(spec.lastEmailDaysAgo),
    // No lastEmailId — these aren't real Gmail messages, so the "open email"
    // deep link is simply omitted rather than pointing somewhere fake.
  }));
}
