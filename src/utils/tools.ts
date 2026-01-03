import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { toolsConfigManager } from '../config/tools.js';
import type { ToolInfo } from '../types.js';

// Common CLI tools to scan for (organized by category)
const TOOLS_TO_SCAN: Record<string, string[]> = {
  // File operations
  'File Operations': [
    'ls', 'dir', 'cat', 'head', 'tail', 'less', 'more', 'cp', 'mv', 'rm', 'mkdir', 'rmdir',
    'touch', 'chmod', 'chown', 'ln', 'find', 'locate', 'tree', 'du', 'df', 'stat', 'file',
    'basename', 'dirname', 'realpath', 'readlink'
  ],
  // Text processing
  'Text Processing': [
    'grep', 'egrep', 'fgrep', 'awk', 'sed', 'cut', 'sort', 'uniq', 'wc', 'tr', 'diff',
    'patch', 'comm', 'join', 'paste', 'expand', 'unexpand', 'fold', 'fmt', 'nl', 'tac',
    'rev', 'strings', 'od', 'xxd', 'hexdump'
  ],
  // Compression & archiving
  'Compression': [
    'tar', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'zip', 'unzip',
    '7z', '7za', 'rar', 'unrar', 'zcat', 'zless'
  ],
  // Network tools
  'Network': [
    'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'ping', 'traceroute', 'netstat',
    'ss', 'nslookup', 'dig', 'host', 'ifconfig', 'ip', 'route', 'arp', 'nc', 'ncat',
    'telnet', 'ftp', 'whois', 'tcpdump', 'nmap'
  ],
  // Process management
  'Process Management': [
    'ps', 'top', 'htop', 'kill', 'killall', 'pkill', 'pgrep', 'nice', 'renice',
    'nohup', 'bg', 'fg', 'jobs', 'wait', 'timeout', 'watch', 'xargs'
  ],
  // System info
  'System Info': [
    'uname', 'hostname', 'uptime', 'whoami', 'id', 'groups', 'w', 'who', 'last',
    'date', 'cal', 'timedatectl', 'free', 'vmstat', 'iostat', 'sar', 'lscpu',
    'lsblk', 'lsusb', 'lspci', 'dmesg', 'sysctl'
  ],
  // Package managers
  'Package Managers': [
    'apt', 'apt-get', 'dpkg', 'yum', 'dnf', 'rpm', 'pacman', 'brew', 'port',
    'snap', 'flatpak', 'pip', 'pip3', 'npm', 'npx', 'yarn', 'pnpm', 'gem',
    'cargo', 'go', 'composer', 'nuget'
  ],
  // Version control
  'Version Control': [
    'git', 'svn', 'hg', 'cvs', 'gh', 'hub'
  ],
  // Development tools
  'Development': [
    'make', 'cmake', 'gcc', 'g++', 'clang', 'clang++', 'ld', 'ar', 'nm', 'objdump',
    'python', 'python3', 'node', 'deno', 'bun', 'ruby', 'perl', 'php', 'java', 'javac',
    'rustc', 'go', 'dotnet', 'swift', 'kotlin', 'scala', 'elixir', 'erlang'
  ],
  // Container & virtualization
  'Containers': [
    'docker', 'docker-compose', 'podman', 'kubectl', 'minikube', 'helm',
    'vagrant', 'virtualbox', 'qemu'
  ],
  // Shell utilities
  'Shell Utilities': [
    'echo', 'printf', 'read', 'test', 'expr', 'bc', 'dc', 'env', 'export',
    'set', 'unset', 'alias', 'unalias', 'source', 'eval', 'exec', 'exit',
    'true', 'false', 'yes', 'sleep', 'tee', 'script', 'screen', 'tmux'
  ],
  // Editors
  'Editors': [
    'vim', 'vi', 'nvim', 'nano', 'emacs', 'code', 'subl', 'atom', 'gedit', 'ed'
  ],
  // Database clients
  'Databases': [
    'mysql', 'psql', 'sqlite3', 'mongo', 'mongosh', 'redis-cli'
  ],
  // Cloud CLIs
  'Cloud': [
    'aws', 'gcloud', 'az', 'doctl', 'heroku', 'vercel', 'netlify', 'flyctl', 'railway'
  ],
  // Misc utilities
  'Utilities': [
    'jq', 'yq', 'xq', 'xmllint', 'base64', 'md5sum', 'sha256sum', 'openssl',
    'gpg', 'ssh-keygen', 'pass', 'age', 'man', 'info', 'apropos', 'whatis',
    'type', 'which', 'whereis', 'command', 'history', 'fc', 'clear', 'reset'
  ]
};

// Get the path of a command using 'which' or 'where' (Windows)
function getCommandPath(cmd: string): string | null {
  try {
    // Sanitize command name - only allow alphanumeric, dash, underscore
    // This prevents command injection attacks
    if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) {
      return null;
    }
    
    const isWindows = process.platform === 'win32';
    const whichCmd = isWindows ? 'where' : 'which';
    const result = execSync(`${whichCmd} ${cmd} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 1000
    }).trim();
    // 'which' may return multiple lines, take the first
    return result.split('\n')[0] || null;
  } catch {
    return null;
  }
}

// Scan for available CLI tools
export async function scanCliTools(showProgress: boolean = true): Promise<ToolInfo[]> {
  const tools: ToolInfo[] = [];
  const allTools = Object.values(TOOLS_TO_SCAN).flat();
  const uniqueTools = [...new Set(allTools)];

  let spinner: ReturnType<typeof ora> | null = null;
  if (showProgress) {
    spinner = ora({
      text: `Scanning for CLI tools (0/${uniqueTools.length})...`,
      color: 'cyan'
    }).start();
  }

  let scanned = 0;
  for (const toolName of uniqueTools) {
    const path = getCommandPath(toolName);
    if (path) {
      // Find which category this tool belongs to
      let description: string | undefined;
      for (const [category, categoryTools] of Object.entries(TOOLS_TO_SCAN)) {
        if (categoryTools.includes(toolName)) {
          description = category;
          break;
        }
      }

      tools.push({
        name: toolName,
        path,
        description
      });
    }
    scanned++;
    if (spinner && scanned % 10 === 0) {
      spinner.text = `Scanning for CLI tools (${scanned}/${uniqueTools.length})...`;
    }
  }

  if (spinner) {
    spinner.succeed(`Found ${tools.length} CLI tools available on your system`);
  }

  return tools;
}

// Run the scan and save results
export async function runToolsScan(showHeader: boolean = true): Promise<void> {
  if (showHeader) {
    console.log('\n' + chalk.bold.cyan('🔍 Scanning System CLI Tools\n'));
    console.log(chalk.dim('This helps llmd generate more accurate commands for your system.\n'));
  }

  const tools = await scanCliTools(true);

  // Save to config
  toolsConfigManager.setAvailableTools(tools);

  // Display summary by category
  const byCategory: Record<string, ToolInfo[]> = {};
  for (const tool of tools) {
    const cat = tool.description || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(tool);
  }

  console.log('\n' + chalk.bold('Available tools by category:\n'));
  for (const [category, categoryTools] of Object.entries(byCategory).sort()) {
    console.log(
      chalk.cyan(`  ${category}: `) +
      chalk.dim(categoryTools.map(t => t.name).join(', '))
    );
  }

  console.log('\n' + chalk.green('✓ Tool information saved to configuration'));
  console.log(chalk.dim(`  Tools config: ${toolsConfigManager.path}\n`));
}

// Get tool names as a formatted string for prompts
export function getAvailableToolsForPrompt(): string {
  const tools = toolsConfigManager.getAvailableTools();
  if (tools.length === 0) return '';

  // Group by category
  const byCategory: Record<string, string[]> = {};
  for (const tool of tools) {
    const cat = tool.description || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(tool.name);
  }

  // Format for prompt
  const lines: string[] = [];
  for (const [category, toolNames] of Object.entries(byCategory).sort()) {
    lines.push(`${category}: ${toolNames.join(', ')}`);
  }

  return lines.join('\n');
}

// List tools command
export function listTools(): void {
  const tools = toolsConfigManager.getAvailableTools();
  const scanDate = toolsConfigManager.getScanDate();

  if (tools.length === 0) {
    console.log(chalk.yellow('\n⚠️  No CLI tools scanned yet.'));
    console.log(chalk.dim('Run "llmd scan" to scan your system for available tools.\n'));
    return;
  }

  console.log('\n' + chalk.bold.cyan('📦 Available CLI Tools\n'));

  if (scanDate) {
    const date = new Date(scanDate);
    console.log(chalk.dim(`Last scanned: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}\n`));
  }

  // Group by category
  const byCategory: Record<string, ToolInfo[]> = {};
  for (const tool of tools) {
    const cat = tool.description || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(tool);
  }

  for (const [category, categoryTools] of Object.entries(byCategory).sort()) {
    console.log(chalk.bold.white(`${category}:`));
    const toolNames = categoryTools.map(t => t.name).sort();
    // Display in columns
    const columns = 6;
    for (let i = 0; i < toolNames.length; i += columns) {
      const row = toolNames.slice(i, i + columns);
      console.log('  ' + row.map(n => chalk.cyan(n.padEnd(12))).join(''));
    }
    console.log();
  }

  console.log(chalk.dim(`Total: ${tools.length} tools`));
  console.log(chalk.dim(`Config: ${toolsConfigManager.path}\n`));
}

// Check if tools have been scanned
export function hasScannedTools(): boolean {
  return toolsConfigManager.hasScannedTools();
}

