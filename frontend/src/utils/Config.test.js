import BASE_URL from './Config';

describe('Config', () => {
  it('should export BASE_URL', () => {
    // Usually it will be /api in tests unless process.env.REACT_APP_BASE_URL is set
    expect(BASE_URL).toBeDefined();
    expect(typeof BASE_URL).toBe('string');
  });
});
