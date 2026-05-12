export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        diagnostics: false,
      },
    }],
  },
  moduleNameMapper: {
    '@apcomp/types': '<rootDir>/../../packages/types/src/index.ts',
    // Mock @react-pdf/renderer and @dnd-kit since they need browser APIs
    '@react-pdf/renderer': '<rootDir>/src/__mocks__/react-pdf.tsx',
    '@dnd-kit/core': '<rootDir>/src/__mocks__/dnd-kit-core.tsx',
    '@dnd-kit/sortable': '<rootDir>/src/__mocks__/dnd-kit-sortable.tsx',
    '@dnd-kit/utilities': '<rootDir>/src/__mocks__/dnd-kit-utilities.ts',
  },
  globals: {
    'ts-jest': {
      diagnostics: false,
    },
  },
};
