import { describe, test, expect } from 'bun:test';
import { parseSearchResponse } from '../searchParser';

describe('parseSearchResponse', () => {
  test('parses valid API response with all fields', () => {
    const apiResponse = {
      totalHits: 1,
      data: [
        {
          id: 'Newtonsoft.Json',
          version: '13.0.3',
          description: 'Popular high-performance JSON framework for .NET',
          authors: ['James Newton-King'],
          totalDownloads: 500000000,
          iconUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/icon',
          verified: true,
          tags: ['json', 'serialization'],
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'Newtonsoft.Json',
      version: '13.0.3',
      description: 'Popular high-performance JSON framework for .NET',
      authors: ['James Newton-King'],
      downloadCount: 500000000,
      iconUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/icon',
      verified: true,
      tags: ['json', 'serialization'],
    });
  });

  test('parses response with missing optional fields', () => {
    const apiResponse = {
      totalHits: 1,
      data: [
        {
          id: 'TestPackage',
          version: '1.0.0',
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'TestPackage',
      version: '1.0.0',
      description: '',
      authors: [],
      downloadCount: 0,
      iconUrl: 'https://www.nuget.org/Content/gallery/img/default-package-icon.svg',
      verified: false,
      tags: [],
    });
  });

  test('normalizes authors from comma-separated string', () => {
    const apiResponse = {
      totalHits: 1,
      data: [
        {
          id: 'TestPackage',
          version: '1.0.0',
          authors: 'Author One, Author Two, Author Three',
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]!.authors).toEqual(['Author One', 'Author Two', 'Author Three']);
  });

  test('normalizes authors from array', () => {
    const apiResponse = {
      totalHits: 1,
      data: [
        {
          id: 'TestPackage',
          version: '1.0.0',
          authors: ['Author One', 'Author Two'],
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]!.authors).toEqual(['Author One', 'Author Two']);
  });

  test('returns empty array for zero results', () => {
    const apiResponse = {
      totalHits: 0,
      data: [],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(0);
  });

  test('returns empty array for null input', () => {
    const result = parseSearchResponse(null);

    expect(result).toHaveLength(0);
  });

  test('returns empty array for undefined input', () => {
    const result = parseSearchResponse(undefined);

    expect(result).toHaveLength(0);
  });

  test('returns empty array for invalid input type', () => {
    const result = parseSearchResponse('invalid');

    expect(result).toHaveLength(0);
  });

  test('returns empty array when data is not an array', () => {
    const apiResponse = {
      totalHits: 1,
      data: 'invalid',
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(0);
  });

  test('filters out packages without required id field', () => {
    const apiResponse = {
      totalHits: 2,
      data: [
        {
          version: '1.0.0',
          description: 'Missing id',
        },
        {
          id: 'ValidPackage',
          version: '1.0.0',
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('ValidPackage');
  });

  test('filters out packages without required version field', () => {
    const apiResponse = {
      totalHits: 2,
      data: [
        {
          id: 'MissingVersion',
        },
        {
          id: 'ValidPackage',
          version: '1.0.0',
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('ValidPackage');
  });

  test('parses multiple packages correctly', () => {
    const apiResponse = {
      totalHits: 3,
      data: [
        {
          id: 'Package.One',
          version: '1.0.0',
          description: 'First package',
        },
        {
          id: 'Package.Two',
          version: '2.0.0',
          description: 'Second package',
        },
        {
          id: 'Package.Three',
          version: '3.0.0',
          description: 'Third package',
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe('Package.One');
    expect(result[1]!.id).toBe('Package.Two');
    expect(result[2]!.id).toBe('Package.Three');
  });

  test('handles authors with extra whitespace', () => {
    const apiResponse = {
      totalHits: 1,
      data: [
        {
          id: 'TestPackage',
          version: '1.0.0',
          authors: '  Author One  ,  Author Two  ,  ',
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]!.authors).toEqual(['Author One', 'Author Two']);
  });

  test('filters non-string tags from array', () => {
    const apiResponse = {
      totalHits: 1,
      data: [
        {
          id: 'TestPackage',
          version: '1.0.0',
          tags: ['valid', 123, 'also-valid', null, 'another'],
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(1);
    expect(result[0]!.tags).toEqual(['valid', 'also-valid', 'another']);
  });

  test('handles verified flag correctly', () => {
    const apiResponse = {
      totalHits: 2,
      data: [
        {
          id: 'Verified.Package',
          version: '1.0.0',
          verified: true,
        },
        {
          id: 'Unverified.Package',
          version: '1.0.0',
          verified: false,
        },
      ],
    };

    const result = parseSearchResponse(apiResponse);

    expect(result).toHaveLength(2);
    expect(result[0]!.verified).toBe(true);
    expect(result[1]!.verified).toBe(false);
  });
});
