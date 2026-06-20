# Frontend Testing Guide

This document outlines how to run and manage unit tests for the HMS frontend. The testing framework uses [Jest](https://jestjs.io/) (bundled with Create React App via `react-scripts`) along with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for component rendering and interactions.

## Basic Test Commands

Open a terminal and navigate to the `frontend/` directory.

1. **Run all tests (Interactive Watch Mode)**
   ```bash
   npm test
   ```
   *Note: This starts Jest in watch mode. It will only run tests related to changed files since the last commit. Press `a` in the interactive menu to force run all tests.*

2. **Run all tests once (No Watch)**
   ```bash
   npm test -- --watchAll=false
   ```

3. **Run a specific test file**
   ```bash
   npm test -- src/pages/auth/Login.test.js
   ```

4. **Run a specific test file (No Watch)**
   ```bash
   npm test -- --watchAll=false src/pages/auth/Login.test.js
   ```

## Checking Code Coverage

We use Istanbul (built into Jest) to measure how much of the frontend application code is covered by tests. 

We have added a custom script to `package.json` to easily generate a coverage report:

1. **Terminal Coverage Report**
   ```bash
   npm run test:cov
   ```
   This will run all tests, disable watch mode, and print a summary table of code coverage in your terminal.

2. **Detailed HTML Report**
   Running the above command also generates a detailed `coverage/` folder. Open `coverage/lcov-report/index.html` in your web browser to visually inspect the line-by-line coverage of your components.

## Adding New Tests

When adding tests for new React components or utility functions:
1. Create a new test file next to the file you are testing, with the `.test.js` extension (e.g., `src/pages/auth/Login.test.js` for `Login.js`).
2. Make sure you mock any complex external dependencies (such as `axios`).

### Testing Environment Notes

Our test environment uses JSDOM, which does not behave exactly like a real browser. Keep the following in mind:

- **Chakra UI Setup:** If your component uses Chakra UI features like `useToast` or theming, you MUST wrap your component in `<ChakraProvider>` during tests. Otherwise, your tests will throw obscure Framer Motion errors or fail silently.
  ```javascript
  import { ChakraProvider } from '@chakra-ui/react';
  
  render(
    <ChakraProvider>
      <YourComponent />
    </ChakraProvider>
  );
  ```

- **Polyfills and Global Mocks:** 
  The file `src/setupTests.js` is automatically executed before your tests. It contains necessary polyfills and mocks for the JSDOM environment, including:
  - `TextEncoder` / `TextDecoder` (Needed for hashing/crypto utilities).
  - `window.crypto.subtle` (Mocked for testing password hashing).
  - `window.matchMedia` (Required by Chakra UI).

- **Module Mappings:**
  If you use dependencies that only ship with ECMAScript Modules (ESM) like `axios` v1+, Jest (which runs in CommonJS) might crash with a `SyntaxError: Cannot use import statement outside a module`. These are fixed by resolving them to their CommonJS versions in `package.json` under `"jest": { "moduleNameMapper": { ... } }`.
