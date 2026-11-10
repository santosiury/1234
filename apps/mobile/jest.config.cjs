module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  testMatch: ["<rootDir>/test/**/*.test.ts?(x)"],
  moduleNameMapper: {
    "^@omini/shared$": "<rootDir>/../../packages/shared/src",
  },
};
