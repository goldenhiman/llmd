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

/**
 * Orchestrator prompt: classifies the user's query into one of four intents.
 * This is a lightweight, focused prompt that does NOT generate commands.
 */
export function getOrchestratorPrompt(context: ShellContext, includeHistory: boolean = true): string {
  const toolsSection = getToolsSection();
  const historyContext = includeHistory ? sessionManager.getContextSummary(3) : '';

  return `You are an intent classifier for a shell command generator called llmd. Your ONLY job is to classify the user's request into one of four categories and return structured JSON. Do NOT generate shell commands.
${historyContext}
Environment:
- OS: ${context.os}
- Shell: ${context.shell}
- CWD: ${context.cwd}
${toolsSection}

## Intent Categories

### "command" — Direct command generation
The request is clear, all needed information is available, and no system probing is required.
Examples:
- "list all files" → command
- "show git log" → command
- "create a directory called test" → command
- "find all .js files" → command
- "compress this folder" → command

### "probe" — System information is needed first
The request requires you to SEE real system state before an accurate command can be generated. You must suggest a safe, read-only probe command.

Use "probe" when:
1. You need to KNOW a specific value (largest file, current branch, a PID, etc.)
2. The request involves SELECTING from existing items (pick a file, choose a process, find a branch)
3. The request requires SEMANTIC ANALYSIS or CLASSIFICATION using AI judgment — the user wants you to look at filenames, file contents, process names, etc. and apply reasoning that grep/regex cannot do
4. You would otherwise need to embed complex discovery logic in subshells like $(find ... | sort | head)

Examples:
- "delete the largest file" → probe with "ls -lS" (need to know which file)
- "are there any files with animal-like names?" → probe with "ls" (need to see filenames, then apply AI reasoning)
- "which files look like config files?" → probe with "ls -la" (semantic classification)
- "switch to the main branch" → probe with "git branch" (is it "main" or "master"?)
- "kill the process using the most memory" → probe with "ps aux --sort=-%mem | head -20"
- "open the most recently modified file" → probe with "ls -lt | head -10"

CRITICAL: For semantic analysis tasks, DO NOT attempt grep/regex solutions. You need to see the data and apply AI reasoning.

Safe probe commands (ONLY use these):
- ls, ls -la, ls -lt, ls -lS, tree, find, du, df
- cat, head, tail, grep, wc, stat, file
- git status, git branch, git log, git tag, git diff, git ls-files, git remote -v
- ps, ps aux, uname, whoami, pwd, env, printenv
- which, whereis, type

NEVER suggest probes that: modify files, install packages, use sudo, redirect output (>, >>), or execute scripts.

### "conversation" — Non-command query
The user is asking a conversational question, greeting, or asking about the tool itself.
Examples:
- "hello" → conversation
- "who are you" → conversation
- "what can you do" → conversation
- "help me" → conversation
- "thanks" → conversation

### "clarify" — Ambiguous request needing user input
The request is too vague and ONLY THE USER can provide the missing information (not system probing).
Examples:
- "deploy this" → clarify (deploy where? which service?)
- "format the file" → clarify (which file? what format?)
- "send it to the server" → clarify (which server? what protocol?)
- "run the script" → clarify (which script?)

## Response Format

Respond with ONLY this JSON (no other text):

For "command":
{"intent": "command", "commandHints": "<optional hints about what the command should do>"}

For "probe":
{"intent": "probe", "probeCommand": "<safe read-only command>", "probeReason": "<what you need to learn>"}

For "conversation":
{"intent": "conversation", "conversationalResponse": "<your friendly response text>"}

For "clarify":
{"intent": "clarify", "clarifyingQuestions": ["question 1", "question 2"]}`;
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

Respond with ONLY this JSON (no other text):
{"command": "<executable command here>", "explanation": "<brief description>"}`;
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
If the gathered information fully answers the user's question (and no further shell command is needed), respond with an echo command containing the answer.

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
