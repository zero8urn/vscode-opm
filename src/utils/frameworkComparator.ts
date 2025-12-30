/**
 * .NET framework comparison and sorting utilities.
 * @module utils/frameworkComparator
 */

/**
 * Framework type categories for sorting precedence.
 */
enum FrameworkType {
  Net = 0, // Modern .NET (net5.0, net6.0, net8.0)
  NetCore = 1, // .NET Core (netcoreapp3.1, netcoreapp2.1)
  NetStandard = 2, // .NET Standard (netstandard2.1, netstandard2.0)
  NetFramework = 3, // Legacy .NET Framework (.NETFramework4.8, net48, net472)
  Other = 4, // Everything else (UAP, Xamarin, etc.)
}

/**
 * Parsed framework moniker components.
 */
interface ParsedFramework {
  type: FrameworkType;
  version: number;
  original: string;
}

/**
 * Parses a .NET target framework moniker (TFM) into components.
 *
 * @param tfm - Target framework moniker (e.g., "net8.0", ".NETStandard2.0")
 * @returns Parsed framework with type and version
 *
 * @remarks
 * Handles various TFM formats:
 * - Modern .NET: "net8.0", "net7.0", "net6.0", "net5.0"
 * - .NET Core: "netcoreapp3.1", "netcoreapp2.1"
 * - .NET Standard: "netstandard2.1", "netstandard2.0", ".NETStandard2.0"
 * - .NET Framework: ".NETFramework4.8", "net48", "net472", "net462"
 * - Special: "Any", "" (empty string)
 */
function parseFramework(tfm: string): ParsedFramework {
  const normalized = tfm.trim();
  const lower = normalized.toLowerCase();

  // Handle empty/Any - treat them identically by normalizing to 'any'
  if (!lower || lower === 'any') {
    return { type: FrameworkType.Other, version: 0, original: 'any' }; // Canonical form
  }

  // Modern .NET (net5.0+) - single digit major version
  // net5.0, net6.0, net7.0, net8.0, net9.0
  const netMatch = lower.match(/^net(\d+)\.(\d+)$/);
  if (netMatch) {
    const major = parseInt(netMatch[1]!, 10);
    const minor = parseInt(netMatch[2]!, 10);
    if (major >= 5) {
      return {
        type: FrameworkType.Net,
        version: major * 10 + minor, // 8.0 -> 80, 6.0 -> 60
        original: lower, // Use normalized lowercase
      };
    }
    // net4.x is .NET Framework (verbose format)
    if (major === 4) {
      return {
        type: FrameworkType.NetFramework,
        version: major * 100 + minor * 10, // 4.8 -> 480
        original: `net4${minor}`, // Canonical: net48, net47, etc.
      };
    }
  }

  // .NET Framework short format (net48, net472, net462, net461, net46, net45, etc.)
  // Pattern: net + major(1 digit) + minor/patch(1-3 digits)
  // net48 -> 4.8, net472 -> 4.7.2, net462 -> 4.6.2
  const netfxShortMatch = lower.match(/^net(\d)(\d+)$/);
  if (netfxShortMatch) {
    const major = parseInt(netfxShortMatch[1]!, 10);
    const minorPatch = parseInt(netfxShortMatch[2]!, 10);
    if (major === 4) {
      // Parse minorPatch digits:
      // Single digit (8): 4.8.0
      // Two+ digits (48, 472): first digit(s) = minor, last digit = patch
      // 8 -> minor=8, patch=0
      // 48 -> minor=4, patch=8 (NO! net48 means 4.8, not 4.4.8)
      // Wait: for net48, minorPatch='8' (captured '48', but '4' is major!)
      // Let me re-check the regex: /^net(\d)(\d+)$/
      // net48 -> \1='4', \2='8' ✓
      // net472 -> \1='4', \2='72' ✓
      // So minorPatch is the part after major
      const calcMinor = minorPatch < 10 ? minorPatch : Math.floor(minorPatch / 10);
      const calcPatch = minorPatch < 10 ? 0 : minorPatch % 10;
      return {
        type: FrameworkType.NetFramework,
        version: major * 100 + calcMinor * 10 + calcPatch, // 4.8.0 -> 480, 4.7.2 -> 472
        original: `net${major}${minorPatch}`, // Canonical: net48, net472, etc.
      };
    }
  }

  // .NET Core
  // netcoreapp3.1, netcoreapp2.1, netcoreapp2.0
  const netcoreMatch = lower.match(/^netcoreapp(\d+)\.(\d+)$/);
  if (netcoreMatch) {
    const major = parseInt(netcoreMatch[1]!, 10);
    const minor = parseInt(netcoreMatch[2]!, 10);
    return {
      type: FrameworkType.NetCore,
      version: major * 10 + minor,
      original: lower, // Use normalized lowercase
    };
  }

  // .NET Standard
  // netstandard2.1, netstandard2.0, netstandard1.6, .NETStandard2.0
  const netstandardMatch = lower.match(/^(?:\.?netstandard)(\d+)\.(\d+)$/);
  if (netstandardMatch) {
    const major = parseInt(netstandardMatch[1]!, 10);
    const minor = parseInt(netstandardMatch[2]!, 10);
    return {
      type: FrameworkType.NetStandard,
      version: major * 10 + minor,
      original: `netstandard${major}.${minor}`, // Canonical format without leading dot
    };
  }

  // .NET Framework (verbose format)
  // .NETFramework4.8, .NETFramework4.7.2, .NETFramework4.6.2
  const netfxVerboseMatch = lower.match(/^\.?netframework(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (netfxVerboseMatch) {
    const major = parseInt(netfxVerboseMatch[1]!, 10);
    const minor = parseInt(netfxVerboseMatch[2]!, 10);
    const patch = parseInt(netfxVerboseMatch[3] || '0', 10);
    if (major === 4) {
      // Map to short format: .NETFramework4.8 -> net48, .NETFramework4.7.2 -> net472
      const shortVersion = patch === 0 ? minor : minor * 10 + patch;
      return {
        type: FrameworkType.NetFramework,
        version: major * 100 + minor * 10 + patch, // Use explicit components: 4.8.0 -> 480, 4.7.2 -> 472
        original: `net${major}${shortVersion}`, // Canonical short format
      };
    }
    return {
      type: FrameworkType.NetFramework,
      version: major * 100 + minor * 10 + patch,
      original: `.netframework${major}.${minor}.${patch}`,
    };
  }

  // Catch-all for unknown frameworks (UAP, Xamarin, Mono, etc.)
  return { type: FrameworkType.Other, version: 0, original: lower }; // Use normalized lowercase
}

/**
 * Compares two .NET target framework monikers for sorting.
 *
 * @param a - First framework moniker
 * @param b - Second framework moniker
 * @returns Negative if a < b, positive if a > b, zero if equal
 *
 * @remarks
 * Sorting precedence (descending):
 * 1. Modern .NET (net8.0, net7.0, net6.0, net5.0) - newest first
 * 2. .NET Core (netcoreapp3.1, netcoreapp2.1) - newest first
 * 3. .NET Standard (netstandard2.1, netstandard2.0) - newest first
 * 4. .NET Framework (net48, net472, net462) - newest first
 * 5. Other frameworks (UAP, Xamarin, etc.) - alphabetically
 *
 * @example
 * ```typescript
 * compareFrameworks('net8.0', 'net6.0') > 0  // true (net8.0 is newer)
 * compareFrameworks('netstandard2.0', 'net6.0') < 0  // true (.NET 6 > .NET Standard)
 * compareFrameworks('net48', 'net6.0') < 0  // true (.NET 6 > .NET Framework)
 * ```
 */
export function compareFrameworks(a: string, b: string): number {
  const frameworkA = parseFramework(a);
  const frameworkB = parseFramework(b);

  // Compare by type first (lower enum value = higher precedence, so reverse comparison)
  if (frameworkA.type !== frameworkB.type) {
    return frameworkB.type - frameworkA.type; // Reverse: lower enum = higher precedence
  }

  // Same type, compare versions (higher version = higher precedence)
  if (frameworkA.version !== frameworkB.version) {
    return frameworkA.version - frameworkB.version; // Higher version first
  }

  // Fallback to comparison of normalized original strings for identical type/version
  return frameworkA.original.localeCompare(frameworkB.original);
}

/**
 * Sorts framework monikers by preference (newest/most modern first).
 *
 * @param frameworks - Array of framework monikers
 * @returns Sorted array (newest/most preferred first)
 *
 * @example
 * ```typescript
 * const sorted = sortFrameworksDescending([
 *   '.NETFramework4.6.2',
 *   'net8.0',
 *   'netstandard2.0',
 *   'net6.0',
 *   'netcoreapp3.1'
 * ]);
 * // Result: ['net8.0', 'net6.0', 'netcoreapp3.1', 'netstandard2.0', '.NETFramework4.6.2']
 * ```
 */
export function sortFrameworksDescending(frameworks: string[]): string[] {
  return [...frameworks].sort((a, b) => -compareFrameworks(a, b)); // Negate for descending
}
