export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '@apcomp/types': '<rootDir>/../../packages/types/src/index.ts',
  },
};