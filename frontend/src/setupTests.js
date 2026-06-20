// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

const crypto = require('crypto');
Object.defineProperty(window, 'crypto', {
  value: {
    subtle: {
      digest: jest.fn().mockImplementation((algorithm, data) => {
        return Promise.resolve(crypto.createHash('sha256').update(Buffer.from(data)).digest());
      })
    },
    getRandomValues: jest.fn().mockImplementation((arr) => {
      return crypto.randomFillSync(arr);
    })
  }
});
