```
  _ _               _ 
 | | |_ __ ___   __| |
 | | | '_ ` _ \ / _` |
 | | | | | | | | (_| |
 |_|_|_| |_| |_|\__,_|
```
https://github.com/user-attachments/assets/4d2225e1-3762-48d1-87b4-1045e64ec5c4


# llmd

> **Talk to your terminal. Let AI write the commands.**

[![npm version](https://img.shields.io/npm/v/llmd-cli.svg)](https://www.npmjs.com/package/llmd-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/llmd-cli.svg)](https://nodejs.org)

**llmd** is a command-line tool that translates natural language into shell commands using AI. Just describe what you want to do, and llmd generates the command, verifies it, warns you about dangerous operations, and lets you execute it with a single keystroke.

## Features

- **Natural Language Interface** - Describe what you want in plain English
- **Multi-Provider Support** - Use OpenAI, Anthropic (Claude), Groq, Google Gemini, or OpenRouter
- **Self-Verification** - AI verifies its own commands with confidence scoring
- **Dangerous Command Detection** - Automatic warnings for destructive operations
- **Interactive Execution** - Review, edit, or cancel commands before running
- **Cross-Platform** - Works on macOS, Linux, and Windows
- **Secure Configuration** - API keys stored locally on your machine

## Quick Start

```bash
# Install globally (one-time sudo required - completely safe!)
sudo npm install -g llmd-cli

# Run the setup wizard (no sudo needed)
llmd setup

# Start using llmd (no sudo needed)
llmd "list all files sorted by size"
```

## Installation

> **💡 About `sudo`:** Global installation requires `sudo` (one-time only) because it installs the `llmd` command to a system directory. This is completely safe and standard practice for all global npm packages—you're just installing a command-line tool, nothing more. After installation, you can use `llmd` normally without `sudo`.

### npm (recommended)

```bash
sudo npm install -g llmd-cli
```

> **Note:** This is a one-time setup. After installation, you'll use `llmd` without `sudo` for all commands. On Windows, run your terminal as Administrator.

### yarn

```bash
sudo yarn global add llmd-cli
```

> **Note:** One-time `sudo` required. After installation, use `llmd` normally. On Windows, run your terminal as Administrator.

### pnpm

```bash
sudo pnpm add -g llmd-cli
```

> **Note:** One-time `sudo` required. After installation, use `llmd` normally. On Windows, run your terminal as Administrator.

### From Source

```bash
git clone https://github.com/goldenhiman/llmd.git
cd llmd
npm install
npm run build
sudo npm link  # Creates a global symlink so you can use 'llmd' command
```

> **Note:** One-time `sudo` required for `npm link` to create the global command. After this, use `llmd` normally without `sudo`.

## Configuration

### Initial Setup

Run the interactive setup wizard:

```bash
llmd setup
```

This will guide you through:
1. Selecting your preferred LLM provider
2. Entering your API key
3. Choosing a model
4. Setting the confidence threshold

### Managing Providers

```bash
# List all configured providers
llmd config list

# Add or update a provider
llmd config set openai
llmd config set anthropic sk-ant-xxxxx

# Set the default provider
llmd config default anthropic

# Change the model for a provider
llmd config model openai gpt-4o-mini

# Set confidence threshold (0-100)
llmd config threshold 80

# View config file location
llmd config path

# Reset configuration to defaults
llmd config reset
```

### Configuration File

Configuration is stored at `~/.config/llmd/config.json` (or equivalent for your OS):

```json
{
  "defaultProvider": "openai",
  "confidenceThreshold": 70,
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "model": "gpt-4o"
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "model": "claude-sonnet-4-20250514"
    }
  }
}
```

### Environment Variables

You can also set API keys via environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GROQ_API_KEY="gsk-..."
export GOOGLE_API_KEY="..."
export OPENROUTER_API_KEY="..."
```

## Usage

### Basic Usage

Simply pass your request as an argument:

```bash
llmd "your natural language command"
```

### Examples

**Git Operations:**
```bash
llmd "create a new branch called feature-auth"
llmd "show me the last 5 commits with stats"
llmd "undo my last commit but keep the changes"
llmd "squash the last 3 commits"
```

**Docker:**
```bash
llmd "list all running containers"
llmd "remove all stopped containers and unused images"
llmd "show logs from the nginx container from the last hour"
```

**File Operations:**
```bash
llmd "find all JavaScript files larger than 1MB"
llmd "count lines of code in all Python files"
llmd "create a backup of this directory with today's date"
llmd "find and delete all node_modules folders"
```

**System Administration:**
```bash
llmd "show disk usage sorted by size"
llmd "list all processes using more than 100MB of memory"
llmd "find which process is using port 3000"
llmd "show network connections on port 443"
```

**Package Management:**
```bash
llmd "update all npm packages to their latest versions"
llmd "list all globally installed npm packages"
llmd "install prettier as a dev dependency"
```

### Interactive Flow

When you run a command, llmd will:

1. **Generate** the shell command using AI
2. **Verify** the command for accuracy
3. **Display** the command with confidence score
4. **Warn** about dangerous operations (if applicable)
5. **Prompt** you to run, edit, or cancel

```
┌─────────────────────────────────────────────────────────────┐
│  $ git checkout -b feature-auth                             │
│                                                             │
│  Creates a new branch named 'feature-auth' and switches to  │
│  it                                                         │
│                                                             │
│  Confidence: 95% • Provider: openai                         │
└─────────────────────────────────────────────────────────────┘
? Action: (Use arrow keys)
❯ Run command
  Edit command
  Cancel
```

**Selecting "Edit command"** allows you to modify the generated command before execution. You'll be prompted to enter your edited version, which will then go through the same verification and safety checks.

## Supported Providers

| Provider | Models | Get API Key |
|----------|--------|-------------|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Anthropic** | claude-sonnet-4-20250514, claude-3-5-haiku | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Groq** | moonshotai/kimi-k2-instruct-0905, openai/gpt-oss-120b, llama-3.3-70b | [console.groq.com/keys](https://console.groq.com/keys) |
| **Google Gemini** | gemini-2.0-flash, gemini-1.5-pro | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **OpenRouter** | Multiple providers | [openrouter.ai/keys](https://openrouter.ai/keys) |

### Provider Comparison

| Provider | Speed | Cost | Best For |
|----------|-------|------|----------|
| OpenAI | Fast | $$ | Best overall accuracy |
| Anthropic | Fast | $$ | Complex reasoning |
| Groq | Very Fast | $ | Speed, free tier available |
| Gemini | Fast | $ | Generous free tier |
| OpenRouter | Varies | Varies | Access to multiple models |

## Safety Features

llmd automatically detects potentially dangerous commands and warns you before execution.

### Severity Levels

| Level | Description | Confirmation |
|-------|-------------|--------------|
| 🚨 **Critical** | System destruction (rm -rf /, mkfs, dd) | Required (explicit yes/no) |
| ⚠️ **High** | Elevated privileges, system configs | Required (explicit yes/no) |
| ⚡ **Medium** | File deletion, package management | Standard prompt |
| 💡 **Low** | File moves, git operations | Standard prompt |
| ✅ **Safe** | Read-only operations | Standard prompt |

### Example Warning

```
┌─────────────────────────────────────────────────────────────┐
│  $ rm -rf ./node_modules                                    │
│                                                             │
│  Confidence: 92% • Provider: openai                         │
│                                                             │
│  ⚠️ HIGH: Recursive/force file deletion                     │
└─────────────────────────────────────────────────────────────┘
? ⚠️  This is a potentially dangerous command. Are you sure? (y/N)
```

### Detected Patterns

- **File System**: `rm -rf`, `mkfs`, `dd`, overwrites
- **Privileges**: `sudo`, `chmod 777`, `chown -R`
- **Remote Execution**: `curl | sh`, `wget | bash`
- **System Services**: `systemctl stop`, `kill -9`
- **Package Management**: Global installs, uninstalls
- **Git**: Force push, reset, rebase

## Confidence Threshold

The confidence threshold determines when llmd asks for clarification:

- Commands with confidence **above** the threshold execute normally
- Commands with confidence **below** the threshold trigger clarification

```bash
# Set threshold (default: 70)
llmd config threshold 80
```

When clarification is needed:

```
⚠️  The command needs clarification:

Generated command:
  $ find . -name "*.log"

Confidence: 55% (threshold: 70%)

Issues:
  • Unclear if search should be recursive
  • File extension might need to be different

Please clarify:
  1. Should this search include subdirectories?
  2. Are you looking for .log files specifically?

? What would you like to do?
❯ Provide more details
  Run command anyway
  Cancel
```

## CLI Reference

```
Usage: llmd [options] [command] [query...]

Natural language to shell commands using AI

Options:
  -V, --version             output the version number
  -h, --help                display help for command

Commands:
  setup                     Interactive setup wizard
  config list               List all configured providers
  config set <provider>     Configure a provider with API key
  config default <provider> Set the default provider
  config threshold <value>  Set confidence threshold (0-100)
  config model <p> <model>  Set the model for a provider
  config path               Show config file path
  config reset              Reset configuration to defaults
  update [check|install]    Check for updates or install latest version
  scan                      Scan system for available CLI tools
  tools                     List scanned CLI tools
```

### Update Commands

Keep llmd up to date:

```bash
# Check if a newer version is available
llmd update
# or explicitly
llmd update check

# Install the latest version
llmd update install
```

### Tool Scanning

llmd can scan your system to discover available CLI tools, which helps it generate more accurate commands:

```bash
# Scan your system for installed CLI tools
llmd scan

# List all scanned tools
llmd tools
```

The scan command detects tools in your PATH and stores them in a local configuration file. This information helps llmd understand what commands are available on your system and generate more appropriate suggestions.

## Session Management

llmd automatically tracks your command history in sessions to provide context-aware command generation. Each terminal session maintains:

- **Command History** - Last 20 commands with their queries, generated commands, and execution results
- **Execution Results** - Exit codes and truncated output (stdout/stderr limited to 500 characters)
- **Current Working Directory** - Tracks directory changes across commands
- **Session Metadata** - Session start time, last activity, and terminal identification

Sessions automatically expire after 24 hours of inactivity. This context helps llmd generate more accurate commands based on your recent activity, understanding the flow of your work and adapting to your current directory and previous commands.

### How It Works

When you run commands, llmd:
1. Tracks each command in your current session
2. Uses the last 3-5 commands as context when generating new commands
3. Understands your current working directory
4. Learns from successful and failed command executions

This means llmd gets smarter as you use it, understanding patterns in your workflow and generating more relevant suggestions.

## Conversational Queries

llmd can handle conversational questions that don't require shell commands, making the tool more interactive and user-friendly:

```bash
llmd "who are you"
llmd "what can you do"
llmd "hello"
llmd "help me"
```

For these queries, llmd provides informational responses instead of generating shell commands. The AI recognizes conversational intent and responds appropriately, helping users understand the tool's capabilities without executing unnecessary commands.

### Example

```
┌─────────────────────────────────────────────────────────────┐
│  💬 Response                                                │
│                                                             │
│  I am llmd, a shell command generator that translates     │
│  natural language into shell commands. Just describe what  │
│  you want to do, and I'll generate the command for you!    │
└─────────────────────────────────────────────────────────────┘
? What would you like to do?
❯ Continue with another command
  Done
```

This feature makes llmd feel more like a helpful assistant rather than just a command generator.

## Troubleshooting

### "No LLM provider configured"

Run `llmd setup` to configure a provider with your API key.

### API Key Errors

1. Verify your API key is correct: `llmd config list`
2. Check if the key is active on the provider's dashboard
3. Ensure you have available credits/quota

### Command Not Found After Install

Make sure your global npm bin directory is in your PATH:

```bash
# Find npm global bin directory
npm config get prefix

# Add to PATH in ~/.bashrc or ~/.zshrc
export PATH="$(npm config get prefix)/bin:$PATH"
```

### Low Confidence on Simple Commands

Try being more specific in your request:

```bash
# Instead of:
llmd "delete files"

# Try:
llmd "delete all .log files in the current directory"
```

### Provider-Specific Issues

- **OpenAI**: Ensure you have GPT-4 access if using gpt-4o
- **Anthropic**: Claude models require a paid account
- **Groq**: Free tier has rate limits
- **Gemini**: Some regions may have restrictions

### Updating llmd

To update to the latest version:

```bash
# Check for updates
llmd update

# Install the latest version
llmd update install

# Or update via npm
npm install -g llmd-cli@latest
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/goldenhiman/llmd.git
cd llmd

# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js "your command"

# Or link globally for testing
npm link
llmd "your command"
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [OpenAI](https://openai.com) for GPT models
- [Anthropic](https://anthropic.com) for Claude
- [Groq](https://groq.com) for lightning-fast inference
- [Google](https://ai.google.dev) for Gemini
- [OpenRouter](https://openrouter.ai) for model aggregation

---

**Made with ❤️ for developers who'd rather describe what they want than remember command syntax.**

