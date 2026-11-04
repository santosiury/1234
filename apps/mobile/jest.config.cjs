module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/test/**/*.test.ts?(x)"],
  moduleNameMapper: {
    "^@omini/shared$": "<rootDir>/../../packages/shared/src",
  },
};
