/**
 * Unit tests for solution settings configuration.
 */

import { describe, expect, it } from 'bun:test';
import { DEFAULT_SOLUTION_SETTINGS, isSolutionScanDepth } from '../solutionSettings';

describe('solutionSettings', () => {
  describe('DEFAULT_SOLUTION_SETTINGS', () => {
    it('should have root-only scan depth by default', () => {
      expect(DEFAULT_SOLUTION_SETTINGS.solutionScanDepth).toBe('root-only');
    });

    it('should have project scan depth of 3 by default', () => {
      expect(DEFAULT_SOLUTION_SETTINGS.projectScanDepth).toBe(3);
    });

    it('should have large workspace threshold of 50 by default', () => {
      expect(DEFAULT_SOLUTION_SETTINGS.largeWorkspaceThreshold).toBe(50);
    });
  });

  describe('isSolutionScanDepth', () => {
    it('should return true for root-only', () => {
      expect(isSolutionScanDepth('root-only')).toBe(true);
    });

    it('should return true for recursive', () => {
      expect(isSolutionScanDepth('recursive')).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isSolutionScanDepth('invalid')).toBe(false);
      expect(isSolutionScanDepth('')).toBe(false);
      expect(isSolutionScanDepth(null)).toBe(false);
      expect(isSolutionScanDepth(undefined)).toBe(false);
      expect(isSolutionScanDepth(123)).toBe(false);
    });
  });
});
