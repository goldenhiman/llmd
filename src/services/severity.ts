import type { SeverityLevel, SeverityCheck } from '../types.js';

interface DangerPattern {
  pattern: RegExp;
  level: SeverityLevel;
  reason: string;
}

const DANGER_PATTERNS: DangerPattern[] = [
  // Critical - System destruction
  { pattern: /rm\s+(-[rf]+\s+)*\/($|\s|;)/, level: 'critical', reason: 'Attempts to delete root filesystem' },
  { pattern: /rm\s+-[rf]*\s+--no-preserve-root/, level: 'critical', reason: 'Bypasses root deletion protection' },
  { pattern: /mkfs\s+/, level: 'critical', reason: 'Formats a filesystem, destroying all data' },
  { pattern: /dd\s+.*of=\/dev\/[sh]d[a-z]/, level: 'critical', reason: 'Writes directly to disk, can destroy data' },
  { pattern: /:\(\)\{\s*:\|:&\s*\};:/, level: 'critical', reason: 'Fork bomb - will crash the system' },
  { pattern: />\s*\/dev\/[sh]d[a-z]/, level: 'critical', reason: 'Writes directly to disk device' },
  { pattern: /mv\s+.*\s+\/dev\/null/, level: 'critical', reason: 'Moves files to /dev/null, destroying them' },
  
  // High - Dangerous operations
  { pattern: /sudo\s+rm\s+-[rf]+/, level: 'high', reason: 'Elevated recursive/force deletion' },
  { pattern: /chmod\s+(-R\s+)?(777|000)/, level: 'high', reason: 'Sets dangerous file permissions' },
  { pattern: /chown\s+-R\s+.*\s+\//, level: 'high', reason: 'Recursive ownership change on root' },
  { pattern: />\s*\/etc\//, level: 'high', reason: 'Overwrites system configuration' },
  { pattern: /curl\s+.*\|\s*(sudo\s+)?(ba)?sh/, level: 'high', reason: 'Pipes remote script to shell' },
  { pattern: /wget\s+.*\|\s*(sudo\s+)?(ba)?sh/, level: 'high', reason: 'Pipes remote script to shell' },
  { pattern: /eval\s+.*\$\(/, level: 'high', reason: 'Executes dynamically generated code' },
  { pattern: /:(){ :|:& };:/, level: 'high', reason: 'Fork bomb pattern variant' },
  
  // Medium - Potentially destructive
  { pattern: /rm\s+-[rf]+/, level: 'medium', reason: 'Recursive/force file deletion' },
  { pattern: /rm\s+\*/, level: 'medium', reason: 'Deletes multiple files with wildcard' },
  { pattern: /sudo\s+/, level: 'medium', reason: 'Runs command with elevated privileges' },
  { pattern: />\s+[^|&]+\.(conf|cfg|ini|json|yaml|yml)/, level: 'medium', reason: 'Overwrites configuration file' },
  { pattern: /pip\s+install\s+--user\s+/, level: 'medium', reason: 'Installs Python packages globally' },
  { pattern: /npm\s+install\s+-g/, level: 'medium', reason: 'Installs npm packages globally' },
  { pattern: /apt(-get)?\s+(remove|purge)/, level: 'medium', reason: 'Removes system packages' },
  { pattern: /brew\s+uninstall/, level: 'medium', reason: 'Removes Homebrew packages' },
  { pattern: /systemctl\s+(stop|disable|mask)/, level: 'medium', reason: 'Modifies system services' },
  { pattern: /kill\s+-9/, level: 'medium', reason: 'Force kills processes' },
  { pattern: /pkill|killall/, level: 'medium', reason: 'Kills processes by name' },
  
  // Low - Worth noting
  { pattern: /rm\s+/, level: 'low', reason: 'Deletes files' },
  { pattern: /mv\s+/, level: 'low', reason: 'Moves/renames files' },
  { pattern: /cp\s+-[rf]*/, level: 'low', reason: 'Copies files (may overwrite)' },
  { pattern: />\s+/, level: 'low', reason: 'Redirects output (may overwrite file)' },
  { pattern: /git\s+(reset|rebase|push\s+-f|push\s+--force)/, level: 'low', reason: 'Potentially destructive git operation' },
  { pattern: /docker\s+(rm|rmi|prune)/, level: 'low', reason: 'Removes Docker resources' },
];

export function checkSeverity(command: string): SeverityCheck {
  const warnings: string[] = [];
  let highestLevel: SeverityLevel = 'safe';
  let primaryReason = '';

  const severityOrder: SeverityLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];

  for (const { pattern, level, reason } of DANGER_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push(reason);
      
      if (severityOrder.indexOf(level) > severityOrder.indexOf(highestLevel)) {
        highestLevel = level;
        primaryReason = reason;
      }
    }
  }

  return {
    level: highestLevel,
    reason: primaryReason,
    warnings: [...new Set(warnings)] // Remove duplicates
  };
}

export function getSeverityColor(level: SeverityLevel): string {
  switch (level) {
    case 'critical':
      return 'red';
    case 'high':
      return 'redBright';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'cyan';
    default:
      return 'green';
  }
}

export function getSeverityEmoji(level: SeverityLevel): string {
  switch (level) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚠️';
    case 'medium':
      return '⚡';
    case 'low':
      return '💡';
    default:
      return '✅';
  }
}

export function requiresConfirmation(level: SeverityLevel): boolean {
  return level === 'critical' || level === 'high';
}

