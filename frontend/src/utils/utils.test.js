import {
  calculateAge,
  formatDateTimeIST,
  formatDateIST,
  getWeekdayIST,
  getDateISTString,
  toTitleCase,
  numberToWords
} from './utils';

describe('utils', () => {
  describe('calculateAge', () => {
    it('should return N/A if dob is not provided', () => {
      expect(calculateAge(null)).toBe('N/A');
    });

    it('should return the original number if number is provided and no hyphen', () => {
      expect(calculateAge(25)).toBe(25);
    });

    it('should correctly calculate age from valid date string', () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 25);
      const dob = pastDate.toISOString();
      // Age could be 25 or 24 depending on month/day, but since we set it to exact same day 25 years ago, it's 25.
      expect(calculateAge(dob)).toBe(25);
    });

    it('should return the input if invalid date string', () => {
      expect(calculateAge('invalid-date')).toBe('invalid-date');
    });
  });

  describe('formatDateTimeIST', () => {
    it('should return empty string if no input', () => {
      expect(formatDateTimeIST(null)).toBe('');
    });

    it('should return empty string for invalid date', () => {
      expect(formatDateTimeIST('invalid-date')).toBe('');
    });

    it('should format date correctly', () => {
      const date = '2023-01-01T12:00:00Z';
      const result = formatDateTimeIST(date);
      expect(typeof result).toBe('string');
      // Contains year
      expect(result).toContain('2023');
    });
  });

  describe('formatDateIST', () => {
    it('should return empty string if no input', () => {
      expect(formatDateIST(null)).toBe('');
    });

    it('should format date correctly', () => {
      const date = '2023-01-01T12:00:00Z';
      const result = formatDateIST(date);
      expect(typeof result).toBe('string');
      expect(result).toContain('2023');
    });
  });

  describe('getWeekdayIST', () => {
    it('should return empty string if no input', () => {
      expect(getWeekdayIST(null)).toBe('');
    });

    it('should return correct weekday', () => {
      // 2023-01-01 was a Sunday
      const date = '2023-01-01T12:00:00Z';
      expect(getWeekdayIST(date)).toBe('Sunday');
    });
  });

  describe('getDateISTString', () => {
    it('should return formatted date string', () => {
      const date = '2023-01-01T12:00:00Z';
      // In IST, 12:00 UTC is 17:30 IST on the same day
      expect(getDateISTString(date)).toBe('2023-01-01');
    });

    it('should handle current date if input is null', () => {
      expect(typeof getDateISTString(null)).toBe('string');
    });
  });

  describe('toTitleCase', () => {
    it('should return empty string if no input', () => {
      expect(toTitleCase(null)).toBe('');
    });

    it('should convert string to title case', () => {
      expect(toTitleCase('hello world')).toBe('Hello World');
      expect(toTitleCase('jOhN DoE')).toBe('John Doe');
    });
  });

  describe('numberToWords', () => {
    it('should convert single digits', () => {
      expect(numberToWords(0)).toBe('Zero');
      expect(numberToWords(5)).toBe('Five');
    });

    it('should convert teens', () => {
      expect(numberToWords(15)).toBe('Fifteen');
    });

    it('should convert tens', () => {
      expect(numberToWords(20)).toBe('Twenty');
      expect(numberToWords(45)).toBe('Forty Five');
    });

    it('should convert hundreds', () => {
      expect(numberToWords(100)).toBe('One Hundred');
      expect(numberToWords(105)).toBe('One Hundred Five');
      expect(numberToWords(999)).toBe('Nine Hundred Ninety Nine');
    });

    it('should convert thousands', () => {
      expect(numberToWords(1000)).toBe('One Thousand');
      expect(numberToWords(1005)).toBe('One Thousand Five');
      expect(numberToWords(1500)).toBe('One Thousand Five Hundred');
      expect(numberToWords(9999)).toBe('Nine Thousand Nine Hundred Ninety Nine');
    });
  });
});
