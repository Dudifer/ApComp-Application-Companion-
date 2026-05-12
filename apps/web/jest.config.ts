export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '@apcomp/types': '<rootDir>/../../../packages/types/src/index.ts',
  },
  globals: {
    'ts-jest': {
      diagnostics: false,
      tsconfig: '../tsconfig.json',
    },
  },
};
