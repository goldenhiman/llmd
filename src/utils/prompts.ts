import type { ShellContext } from '../types.js';
import { toolsConfigManager } from '../config/tools.js';
import { sessionManager } from '../services/session.js';

function getToolsSection(): string {
  const tools = toolsConfigManager.getAvailableTools();
  if (tools.length === 0) return '';

  // Group by category for a concise prompt
  const byCategory: Record<string, string[]> = {};
  for (const tool of tools) {
    const cat = tool.description || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(tool.name);
  }
  
  const toolLines = Object.entries(byCategory)
    .map(([cat, names]) => `  ${cat}: ${names.join(', ')}`)
    .join('\n');
  
  return `\nAvailable CLI tools on this system:\n${toolLines}\n\nPrefer using these available tools in your commands.`;
}

export function getSystemPrompt(context: ShellContext, includeHistory: boolean = true): string {
  const toolsSection = getToolsSection();
  const historyContext = includeHistory ? sessionManager.getContextSummary(3) : '';

  return `You are a shell command generator. Convert the user's natural language request into a shell command.
${historyContext}
Environment:
- OS: ${context.os}
- Shell: ${context.shell}
- CWD: ${context.cwd}
${toolsSection}
IMPORTANT: The "command" value must be a RAW, EXECUTABLE shell command. Do NOT include:
- Backticks or markdown formatting
- $ or # prefixes
- Comments
- Line breaks (use ; or && for multiple commands)

If the user asks a conversational question that doesn't require a shell command (like "who are you", "what can you do", "hello"), respond with an echo command that provides the answer. For example:
- "who are you" -> echo "I am llmd, a shell command generator that translates natural language into shell commands."
- "hello" -> echo "Hello! I can help you generate shell commands. Just describe what you want to do."

Respond with ONLY this JSON (no other text):
{"command": "<executable command here>", "explanation": "<brief description>"}`;
}

export function getInfoGatheringSystemPrompt(context: ShellContext, includeHistory: boolean = true): string {
  const toolsSection = getToolsSection();
  const historyContext = includeHistory ? sessionManager.getContextSummary(3) : '';

  return `You are a shell command generator. Convert the user's natural language request into a shell command.
${historyContext}
Environment:
- OS: ${context.os}
- Shell: ${context.shell}
- CWD: ${context.cwd}
${toolsSection}

## CRITICAL: When to Request Information Gathering (needsInfo: true)

You MUST request a probe command when ANY of these conditions apply:

### 1. You need to KNOW a specific value before generating the command
- "Delete the largest file" → Probe with "ls -lS" to see sizes, then generate "rm <actual-filename>"
- "Open the config file" → Probe with "ls" to see what exists, then generate the open command
- "Switch to the main branch" → Probe with "git branch" to check if it's "main" or "master"

### 2. The request involves selecting, choosing, or picking from existing items
- "Kill the process using the most memory" → Probe with "ps aux --sort=-%mem" to identify the PID
- "Edit the most recently modified file" → Probe with "ls -lt" to find it
- "Checkout the latest tag" → Probe with "git tag --sort=-v:refname" to find the tag name

### 3. The task requires SEMANTIC ANALYSIS or CLASSIFICATION using AI judgment
This is CRITICAL: If the user asks you to analyze, classify, categorize, identify, or find items based on:
- Similarity ("looks like", "similar to", "resembles", "related to")
- Categories ("animal names", "product codes", "date-like", "names of people")
- Patterns that require understanding ("meaningful names", "suspicious files", "test files")
- Any judgment that grep/regex CANNOT reliably perform

Examples where you MUST probe first:
- "Are there any files with animal-like names?" → Probe with "ls" to get filenames, then YOU analyze them
- "Which files look like configuration files?" → Probe with "ls -la", then YOU classify them
- "Find files that seem related to authentication" → Probe with "ls" or "find", then YOU identify relevant ones
- "Are there any files named after cities?" → Probe with "ls", then YOU determine which are city names

DO NOT try to solve these with grep/regex patterns like: ls | grep -E "cat|dog|lion"
That approach is brittle and misses the point. YOU need to see the data and apply AI reasoning.

### 4. You would otherwise embed complex discovery logic in the command
- BAD: rm "$(find . -type f -exec stat ... | sort | head -1 | cut ...)"
- GOOD: First probe to find the file, then generate a simple "rm <actual-filename>"

## When to Generate Command Directly (needsInfo: false)

1. **The command is self-contained with no unknowns**
   - "List all files" → Just generate "ls -la"
   - "Show git status" → Just generate "git status"
   - "Create a directory called test" → Just generate "mkdir test"

2. **You need USER CLARIFICATION (not system information)**
   - User's intent or preference ("which format do you want?")
   - Subjective choices only the user can answer
   - Ambiguous references like "the important file" (user must specify)

3. **The query is a simple question or greeting**
   - Use an echo command to respond conversationally

## Safe Read-Only Probe Commands

ONLY use these for probing:
- File listing: ls, ls -la, ls -lt, ls -lS, tree, find (without -exec that modifies), du, df
- File content: cat, head, tail, grep (for searching within files), wc
- File info: stat, file
- Git: git status, git branch, git log, git tag, git diff, git ls-files, git remote -v
- System: ps, ps aux, top -l 1, uname, whoami, pwd, env, printenv
- Tools: which, whereis, type

NEVER probe with commands that: modify files, install packages, use sudo, redirect output (>, >>), or execute scripts.

## Response Format

Respond with ONLY ONE of these JSON formats (no other text):

1. When you MUST see system state first (including for semantic analysis tasks):
{"needsInfo": true, "probeCommand": "<read-only command>", "reason": "<what you need to learn>"}

2. When you can generate the command directly:
{"needsInfo": false, "command": "<executable command>", "explanation": "<brief description>"}`;
}

export function getSystemPromptWithGatheredInfo(context: ShellContext, gatheredInfo: string, includeHistory: boolean = true): string {
  const toolsSection = getToolsSection();
  const historyContext = includeHistory ? sessionManager.getContextSummary(3) : '';

  return `You are a shell command generator. Convert the user's natural language request into a shell command.
${historyContext}
Environment:
- OS: ${context.os}
- Shell: ${context.shell}
- CWD: ${context.cwd}
${toolsSection}

GATHERED INFORMATION:
The following information was gathered from the system to help generate an accurate command:
---
${gatheredInfo}
---

Use this gathered information to generate the most accurate command for the user's request.

IMPORTANT: The "command" value must be a RAW, EXECUTABLE shell command. Do NOT include:
- Backticks or markdown formatting
- $ or # prefixes
- Comments
- Line breaks (use ; or && for multiple commands)

Respond with ONLY this JSON (no other text):
{"command": "<executable command here>", "explanation": "<brief description>"}`;
}

export function getVerificationPrompt(command: string, query: string, context: ShellContext): string {
  return `You are a shell command verification expert. Analyze if the following command correctly fulfills the user's request.

User's request: "${query}"
Generated command: ${command}

Current environment:
- Operating System: ${context.os}
- Shell: ${context.shell}
- Current Directory: ${context.cwd}

CRITICAL: Verify the command format is valid:
1. Is it a single, executable shell command?
2. Does it contain NO markdown formatting, backticks, or $ prefixes?
3. Is it syntactically correct for ${context.shell} on ${context.os}?
4. Can it be executed directly without modification?

Analyze the command and respond STRICTLY in valid JSON format with NO additional text:
{
  "confidence": <0-100 integer representing how confident you are the command is correct>,
  "isCorrect": <true if the command fulfills the request AND is in valid format, false otherwise>,
  "issues": ["list of any issues or concerns with the command, including format issues"],
  "suggestedQuestions": ["questions to ask the user if clarification is needed"]
}

Consider:
1. Does the command match the user's intent?
2. Is the command syntactically correct?
3. Is the command in the correct format (no markdown, no extra formatting)?
4. Are there any missing flags or options?
5. Could the command cause unintended side effects?`;
}

export const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  groq: ['openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct-0905', 'llama-3.3-70b-versatile'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openrouter: ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o', 'google/gemini-2.0-flash-exp']
};

