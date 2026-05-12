import React from 'react';

export const PDFViewer = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="pdf-viewer">{children}</div>
);

export const Document = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="pdf-document">{children}</div>
);

export const Page = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="pdf-page">{children}</div>
);

export const View = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

export const Text = ({ children }: { children: React.ReactNode }) => (
  <span>{children}</span>
);

export const StyleSheet = {
  create: (styles: Record<string, any>) => styles,
};

export const Font = {
  register: () => {},
};

export const Link = ({ children }: { children: React.ReactNode }) => (
  <a>{children}</a>
);

export const pdf = () => ({
  toBlob: async () => new Blob(['mock pdf'], { type: 'application/pdf' }),
});
