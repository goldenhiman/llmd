import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { configManager } from '../config/manager.js';

interface NpmRegistryResponse {
  'dist-tags': {
    latest: string;
  };
}

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  error?: string;
}

// Get the current package version from package.json
export function getCurrentVersion(): string {
  try {
    // Navigate from dist/utils/version.js to package.json
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return '0.0.0';
  }
}

// Compare semver versions (returns true if v2 > v1)
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const curr = currentParts[i] || 0;
    const lat = latestParts[i] || 0;
    if (lat > curr) return true;
    if (lat < curr) return false;
  }
  return false;
}

// Check NPM registry for the latest version
export async function checkForUpdates(force: boolean = false): Promise<VersionCheckResult> {
  const currentVersion = getCurrentVersion();
  const packageName = 'llmd-cli';

  // Skip if already checked today (unless forced)
  if (!force && !configManager.shouldCheckVersion()) {
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        currentVersion,
        latestVersion: null,
        hasUpdate: false,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json() as NpmRegistryResponse;
    const latestVersion = data['dist-tags']?.latest;

    // Update last check timestamp
    configManager.setLastVersionCheck(Date.now());

    if (!latestVersion) {
      return {
        currentVersion,
        latestVersion: null,
        hasUpdate: false,
        error: 'Could not determine latest version'
      };
    }

    return {
      currentVersion,
      latestVersion,
      hasUpdate: isNewerVersion(currentVersion, latestVersion)
    };
  } catch (error) {
    // Network error, timeout, or offline - silently continue
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Display update hint if available
export function displayUpdateHint(result: VersionCheckResult): void {
  if (result.hasUpdate && result.latestVersion) {
    console.log(
      chalk.yellow('\n💡 Update available: ') +
      chalk.dim(`v${result.currentVersion}`) +
      chalk.yellow(' → ') +
      chalk.green(`v${result.latestVersion}`)
    );
    console.log(
      chalk.dim('   Run ') +
      chalk.cyan('llmd update install') +
      chalk.dim(' or ') +
      chalk.cyan('npm update -g llmd-cli') +
      chalk.dim(' to update\n')
    );
  }
}
