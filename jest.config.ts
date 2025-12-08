import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  bail: 1,
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,

  preset: 'ts-jest',
  testEnvironment: 'node',

  roots: ['<rootDir>/test'],

  testMatch: ['**/*.spec.ts', '**/*.test.ts'],

  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  setupFiles: ['dotenv/config'],

  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/index.ts', '!src/**/*.module.ts'],
  coverageDirectory: '<rootDir>/coverage',
  coverageProvider: 'v8',

  coveragePathIgnorePatterns: ['/node_modules/', '<rootDir>/test/', '.mock.ts', '.module.ts', '.*utils.*', '.*validators.*', '.*dto.*'],

  verbose: true,
};

export default config;
