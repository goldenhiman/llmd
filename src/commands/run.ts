import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { configManager } from '../config/manager.js';
import { llmService } from '../services/llm.js';
import { verifyCommand, formatVerificationIssues, formatSuggestedQuestions } from '../services/verifier.js';
import { checkSeverity, getSeverityEmoji, requiresConfirmation } from '../services/severity.js';
import { executeCommand } from '../utils/terminal.js';
import { checkForUpdates, displayUpdateHint } from '../utils/version.js';
import { sessionManager } from '../services/session.js';
import { isProbeCommandSafe } from '../utils/tools.js';
import type { GeneratedCommand, VerificationResult, IntentClassification } from '../types.js';

// Store version check result (started in background)
let versionCheckPromise: Promise<Awaited<ReturnType<typeof checkForUpdates>>> | null = null;

const MAX_PROBE_RETRIES = 3;

// ─── Entry Point ──────────────────────────────────────────────

export async function runCommand(query: string, enableInfoGathering: boolean = true): Promise<void> {
  // Start version check in background (non-blocking)
  if (!versionCheckPromise) {
    versionCheckPromise = checkForUpdates();
  }

  // Check if any provider is configured
  if (!configManager.hasAnyProvider()) {
    console.log(chalk.yellow('\n⚠️  No LLM provider configured.'));
    console.log(chalk.dim('Run "llmd setup" to configure a provider.\n'));
    return;
  }

  const spinner = ora({
    text: 'Understanding your request...',
    color: 'cyan'
  }).start();

  try {
    if (enableInfoGathering) {
      // Step 1: Classify intent (lightweight AI call)
      const intent = await llmService.classifyIntent(query);
      spinner.stop();

      // Step 2: Dispatch to the right handler
      switch (intent.intent) {
        case 'conversation':
          return await handleConversation(query, intent);

        case 'clarify':
          return await handleClarify(query, intent);

        case 'probe':
          return await handleProbeFlow(query, spinner, intent);

        case 'command':
        default:
          return await handleCommandFlow(query, spinner, intent);
      }
    } else {
      // Info gathering disabled — go straight to command generation
      spinner.text = 'Generating command...';
      const generated = await llmService.generateCommand(query);
      spinner.stop();
      return await processGeneratedCommand(query, generated);
    }
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n✗ Error: ${message}\n`));

    if (message.includes('API')) {
      console.log(chalk.dim('Check your API key configuration with: llmd config list\n'));
    }
  }
}

// ─── Intent Handlers ──────────────────────────────────────────

/**
 * Handle conversational queries (greetings, questions about the tool, etc.)
 * No command generation, no verification. 0 extra AI calls.
 */
async function handleConversation(query: string, intent: IntentClassification): Promise<void> {
  const message = intent.conversationalResponse || "I'm llmd, a shell command generator. Describe what you want to do and I'll generate the command.";

  console.log('\n' + boxen(chalk.green.bold(message), {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: 'green',
    title: '💬 Response',
    titleAlignment: 'left'
  }));

  // Track in session
  const generated: GeneratedCommand = { command: `echo "${message}"`, explanation: 'Conversational response' };
  const verification: VerificationResult = { confidence: 100, isCorrect: true };
  sessionManager.addCommand(query, generated, verification, undefined, process.cwd());

  // Ask if user wants to continue
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Continue with another command', value: 'continue' },
        { name: 'Done', value: 'done' }
      ],
      default: 'continue'
    }
  ]);

  if (action === 'continue') {
    const { nextQuery } = await inquirer.prompt<{ nextQuery: string }>([
      { type: 'input', name: 'nextQuery', message: 'What would you like to do?' }
    ]);
    if (nextQuery.trim()) {
      await runCommand(nextQuery);
    }
  } else {
    console.log(chalk.dim('\nGoodbye!\n'));
  }
}

/**
 * Handle ambiguous queries that need user clarification.
 * 0 extra AI calls — just asks the user for more info.
 */
async function handleClarify(query: string, intent: IntentClassification): Promise<void> {
  const questions = intent.clarifyingQuestions || ['Could you provide more details about what you want to do?'];

  console.log('\n' + chalk.yellow('⚠️  I need a bit more information:\n'));

  questions.forEach((q, i) => {
    console.log(chalk.cyan(`  ${i + 1}. ${q}`));
  });
  console.log();

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Provide more details', value: 'clarify' },
        { name: 'Try generating anyway', value: 'force' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }
  ]);

  if (action === 'clarify') {
    const { additionalInfo } = await inquirer.prompt<{ additionalInfo: string }>([
      { type: 'input', name: 'additionalInfo', message: 'Add more details:' }
    ]);

    if (additionalInfo.trim()) {
      const enhancedQuery = `${query}. Additional context: ${additionalInfo}`;
      await runCommand(enhancedQuery);
    }
  } else if (action === 'force') {
    // Skip orchestrator, go straight to command generation
    const spinner = ora({ text: 'Generating command...', color: 'cyan' }).start();
    const generated = await llmService.generateCommand(query);
    spinner.stop();
    await processGeneratedCommand(query, generated);
  }
}

/**
 * Handle queries that need system probing first.
 * Runs a safe probe command, gathers info, then generates the final command.
 */
async function handleProbeFlow(
  query: string,
  spinner: ReturnType<typeof ora>,
  intent: IntentClassification
): Promise<void> {
  const probeCommand = intent.probeCommand || 'ls -la';
  const probeReason = intent.probeReason || 'Need to see system state first';

  // Run the probe with safety checks and retry logic
  const gatheredInfo = await handleProbeExecution(query, probeCommand, probeReason);

  if (gatheredInfo === null) {
    // User cancelled
    return;
  }

  if (gatheredInfo === 'skip') {
    // User or system chose to skip probing — generate without context
    spinner.start('Generating command...');
    const generated = await llmService.generateCommand(query);
    spinner.stop();
    return await processGeneratedCommand(query, generated);
  }

  // Generate command with gathered context
  spinner.start('Generating command with gathered information...');
  const generated = await llmService.generateCommandWithContext(query, gatheredInfo);
  spinner.stop();
  return await processGeneratedCommand(query, generated);
}

/**
 * Handle straightforward command generation.
 */
async function handleCommandFlow(
  query: string,
  spinner: ReturnType<typeof ora>,
  intent: IntentClassification
): Promise<void> {
  // If orchestrator provided hints, append them to the query for generation
  const genQuery = intent.commandHints
    ? `${query} (Hint: ${intent.commandHints})`
    : query;

  spinner.start('Generating command...');
  const generated = await llmService.generateCommand(genQuery);
  spinner.stop();

  return await processGeneratedCommand(query, generated);
}

// ─── Shared Post-Generation Handler ───────────────────────────

/**
 * Checks if a generated command is an informational echo response.
 * Regex-only, no AI call.
 */
function isInformationalCommand(command: string, query: string): boolean {
  const trimmed = command.trim();

  // Must be an echo or printf command
  const echoMatch = trimmed.match(/^(echo|printf)\s+["'](.+)["']\s*$/);
  if (!echoMatch) {
    return false;
  }

  // If the user explicitly asked for echo/printf, it's NOT informational
  const lowerQuery = query.toLowerCase().trim();
  if (/\b(echo|printf)\b/.test(lowerQuery)) {
    return false;
  }

  return true;
}

/**
 * Extracts the message text from an echo/printf command.
 */
function extractInfoMessage(command: string): string {
  const match = command.trim().match(/^(?:echo|printf)\s+["'](.+)["']\s*$/);
  return match ? match[1] : command;
}

/**
 * Shared handler that processes any generated command — whether from direct
 * generation or post-probe generation. Handles informational responses,
 * verification, clarification, and execution.
 */
async function processGeneratedCommand(
  query: string,
  generated: GeneratedCommand
): Promise<void> {
  // Step 1: Lightweight regex check for informational responses
  if (isInformationalCommand(generated.command, query)) {
    const message = extractInfoMessage(generated.command);
    return await displayInformationalMessage(query, generated, message);
  }

  // Step 2: Verify command (AI call)
  const spinnerVerify = ora({ text: 'Verifying command...', color: 'cyan' }).start();
  const verification = await verifyCommand(generated.command, query);
  spinnerVerify.stop();

  // Step 3: If verification shows clarification needed
  if (verification.needsClarification) {
    return await handleVerificationClarification(query, generated, verification.result);
  }

  // Step 4: Severity check + display + execute
  return await displayAndExecute(query, generated, verification.result);
}

// ─── Probe Execution Logic ────────────────────────────────────

/**
 * Handles probe execution with safety checks and retry logic.
 * Returns gathered info, 'skip', or null (cancelled).
 */
async function handleProbeExecution(
  originalQuery: string,
  probeCommand: string,
  reason: string,
  retryCount: number = 0,
  previousFailures: string[] = []
): Promise<string | null | 'skip'> {
  // Verify the probe command is safe
  const safetyCheck = isProbeCommandSafe(probeCommand);

  if (!safetyCheck.safe) {
    console.log('\n' + chalk.yellow('⚠️  The requested probe command is not safe:'));
    console.log(chalk.dim(`  Command: ${probeCommand}`));
    console.log(chalk.dim(`  Reason: ${safetyCheck.reason}`));

    const failureInfo = `Command "${probeCommand}" was rejected: ${safetyCheck.reason}`;
    const allFailures = [...previousFailures, failureInfo];

    if (retryCount < MAX_PROBE_RETRIES) {
      console.log(chalk.cyan(`\nRetrying with a safer command (attempt ${retryCount + 1}/${MAX_PROBE_RETRIES})...\n`));

      const retryResult = await retrySaferProbe(originalQuery, allFailures);

      if (retryResult && retryResult.probeCommand) {
        return handleProbeExecution(
          originalQuery,
          retryResult.probeCommand,
          retryResult.probeReason || reason,
          retryCount + 1,
          allFailures
        );
      }
    }

    console.log(chalk.yellow(`\nMax retries (${MAX_PROBE_RETRIES}) reached. Falling back to generating command without additional info.\n`));
    return 'skip';
  }

  // Display the probe request
  const attemptText = retryCount > 0 ? chalk.dim(` (attempt ${retryCount + 1})`) : '';
  const content = chalk.cyan.bold('📋 Information Gathering Request\n\n') +
    chalk.white('To generate a more accurate command, I need to gather some information first.\n\n') +
    chalk.dim('Reason: ') + chalk.white(reason) + '\n\n' +
    chalk.dim('Read-only command to run:\n') +
    chalk.cyan(`  $ ${probeCommand}`);

  console.log('\n' + boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: 'blue',
    title: `🔍 Need More Info${attemptText}`,
    titleAlignment: 'left'
  }));

  // Ask for permission
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'Allow this read-only command to gather information?',
      choices: [
        { name: 'Yes, run the command', value: 'run' },
        { name: 'No, generate without additional info', value: 'skip' },
        { name: 'Cancel', value: 'cancel' }
      ],
      default: 'run'
    }
  ]);

  if (action === 'cancel') {
    console.log(chalk.dim('\nCancelled.\n'));
    return null;
  }
  if (action === 'skip') {
    return 'skip';
  }

  // Execute the probe command
  console.log(chalk.dim('\nGathering information...\n'));

  try {
    const result = await executeCommand(probeCommand);

    let gatheredInfo = '';
    if (result.stdout) {
      gatheredInfo += result.stdout;
    }
    if (result.stderr && result.exitCode !== 0) {
      gatheredInfo += '\n[stderr]: ' + result.stderr;
    }

    if (result.exitCode !== 0) {
      console.log(chalk.yellow(`\n⚠️  Probe command exited with code ${result.exitCode}`));
    } else {
      console.log(chalk.green('✓ Information gathered successfully\n'));
    }

    const maxInfoSize = 4000;
    if (gatheredInfo.length > maxInfoSize) {
      gatheredInfo = gatheredInfo.substring(0, maxInfoSize) + '\n...(truncated)';
    }

    return gatheredInfo || '(no output)';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n✗ Failed to gather information: ${message}\n`));
    return null;
  }
}

/**
 * Asks the AI for a safer probe command after previous attempts were rejected.
 */
async function retrySaferProbe(
  originalQuery: string,
  previousFailures: string[]
): Promise<{ probeCommand: string; probeReason?: string } | null> {
  try {
    const failureContext = previousFailures
      .map((f, i) => `  ${i + 1}. ${f}`)
      .join('\n');

    const retryQuery = `${originalQuery}

IMPORTANT: Your previous probe command(s) were rejected for safety reasons:
${failureContext}

Please suggest a DIFFERENT, SAFE read-only probe command.`;

    const result = await llmService.classifyIntent(retryQuery);

    if (result.intent === 'probe' && result.probeCommand) {
      return {
        probeCommand: result.probeCommand,
        probeReason: result.probeReason
      };
    }

    return null;
  } catch {
    console.log(chalk.dim('Failed to get retry suggestion from AI.\n'));
    return null;
  }
}

// ─── Display Handlers ─────────────────────────────────────────

/**
 * Display an informational (conversational) response.
 */
async function displayInformationalMessage(
  query: string,
  generated: GeneratedCommand,
  message: string,
): Promise<void> {
  console.log('\n' + boxen(chalk.green.bold(message), {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: 'green',
    title: '💬 Response',
    titleAlignment: 'left'
  }));

  // Track in session (not executed)
  const verification: VerificationResult = { confidence: 100, isCorrect: true };
  sessionManager.addCommand(query, generated, verification, undefined, process.cwd());

  // Ask if user wants to continue
  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Continue with another command', value: 'continue' },
        { name: 'Done', value: 'done' }
      ],
      default: 'continue'
    }
  ]);

  if (action === 'continue') {
    const { nextQuery } = await inquirer.prompt<{ nextQuery: string }>([
      { type: 'input', name: 'nextQuery', message: 'What would you like to do?' }
    ]);
    if (nextQuery.trim()) {
      await runCommand(nextQuery);
    }
  } else {
    console.log(chalk.dim('\nGoodbye!\n'));
  }
}

/**
 * Handle low-confidence verification that needs clarification.
 */
async function handleVerificationClarification(
  originalQuery: string,
  generated: GeneratedCommand,
  verification: VerificationResult
): Promise<void> {
  console.log('\n' + chalk.yellow('⚠️  The command needs clarification:\n'));

  console.log(chalk.dim('Generated command:'));
  console.log(chalk.cyan(`  $ ${generated.command}\n`));

  console.log(chalk.dim(`Confidence: ${verification.confidence}% (threshold: ${configManager.getConfidenceThreshold()}%)\n`));

  const issues = formatVerificationIssues(verification);
  if (issues.length > 0) {
    console.log(chalk.yellow('Issues:'));
    issues.forEach(issue => console.log(chalk.dim(`  ${issue}`)));
    console.log();
  }

  const questions = formatSuggestedQuestions(verification);
  if (questions.length > 0) {
    console.log(chalk.cyan('Please clarify:'));
    questions.forEach(q => console.log(chalk.dim(`  ${q}`)));
    console.log();
  }

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Provide more details', value: 'clarify' },
        { name: 'Run command anyway', value: 'run' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }
  ]);

  if (action === 'clarify') {
    const { additionalInfo } = await inquirer.prompt<{ additionalInfo: string }>([
      { type: 'input', name: 'additionalInfo', message: 'Add more details:' }
    ]);

    if (additionalInfo.trim()) {
      const enhancedQuery = `${originalQuery}. Additional context: ${additionalInfo}`;
      await runCommand(enhancedQuery);
    }
  } else if (action === 'run') {
    await displayAndExecute(originalQuery, generated, verification);
  }
}

/**
 * Display command and handle execution (with severity checks).
 */
async function displayAndExecute(
  query: string,
  generated: GeneratedCommand,
  verification: VerificationResult
): Promise<void> {
  const severity = checkSeverity(generated.command);
  const severityEmoji = getSeverityEmoji(severity.level);

  let content = chalk.bold.white(`$ ${generated.command}`);

  if (generated.explanation) {
    content += '\n\n' + chalk.dim(generated.explanation);
  }

  content += '\n\n' + chalk.dim(`Confidence: ${verification.confidence}%`);
  content += chalk.dim(` • Provider: ${llmService.getProviderName()}`);

  if (severity.level !== 'safe') {
    content += '\n\n' + chalk[severity.level === 'critical' || severity.level === 'high' ? 'red' : 'yellow'](
      `${severityEmoji} ${severity.level.toUpperCase()}: ${severity.reason}`
    );

    if (severity.warnings.length > 1) {
      severity.warnings.slice(1).forEach(warning => {
        content += '\n' + chalk.dim(`  • ${warning}`);
      });
    }
  }

  console.log('\n' + boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: severity.level === 'critical' ? 'red' :
                 severity.level === 'high' ? 'yellow' : 'cyan',
    title: 'Generated Command',
    titleAlignment: 'left'
  }));

  if (requiresConfirmation(severity.level)) {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('⚠️  This is a potentially dangerous command. Are you sure?'),
        default: false
      }
    ]);

    if (confirm) {
      const result = await execute(generated.command);
      sessionManager.addCommand(query, generated, verification, {
        exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr
      }, process.cwd());
    } else {
      console.log(chalk.dim('\nCommand cancelled.\n'));
      sessionManager.addCommand(query, generated, verification, undefined, process.cwd());
    }
  } else {
    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: 'list',
        name: 'action',
        message: 'Action:',
        choices: [
          { name: 'Run command', value: 'run' },
          { name: 'Edit command', value: 'edit' },
          { name: 'Cancel', value: 'cancel' }
        ],
        default: 'run'
      }
    ]);

    if (action === 'run') {
      const result = await execute(generated.command);
      sessionManager.addCommand(query, generated, verification, {
        exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr
      }, process.cwd());
    } else if (action === 'edit') {
      const { editedCommand } = await inquirer.prompt<{ editedCommand: string }>([
        { type: 'input', name: 'editedCommand', message: 'Edit command:', default: generated.command }
      ]);

      if (editedCommand.trim()) {
        const editedSeverity = checkSeverity(editedCommand);
        if (requiresConfirmation(editedSeverity.level)) {
          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: 'confirm',
              name: 'confirm',
              message: chalk.red(`⚠️  ${editedSeverity.reason}. Continue?`),
              default: false
            }
          ]);
          if (!confirm) {
            console.log(chalk.dim('\nCommand cancelled.\n'));
            sessionManager.addCommand(query, { ...generated, command: editedCommand }, verification, undefined, process.cwd());
            return;
          }
        }
        const result = await execute(editedCommand);
        sessionManager.addCommand(query, { ...generated, command: editedCommand }, verification, {
          exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr
        }, process.cwd());
      }
    } else {
      console.log(chalk.dim('\nCommand cancelled.\n'));
      sessionManager.addCommand(query, generated, verification, undefined, process.cwd());
    }
  }
}

// ─── Execution ────────────────────────────────────────────────

async function execute(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  console.log(chalk.dim('\nExecuting...\n'));

  const result = await executeCommand(command);

  if (result.exitCode === 0) {
    console.log(chalk.green('\n✓ Command completed successfully\n'));
  } else {
    console.log(chalk.yellow(`\n⚠️  Command exited with code ${result.exitCode}\n`));
  }

  await showUpdateHintIfAvailable();

  return result;
}

async function showUpdateHintIfAvailable(): Promise<void> {
  if (versionCheckPromise) {
    try {
      const versionResult = await versionCheckPromise;
      displayUpdateHint(versionResult);
    } catch {
      // Silently ignore version check errors
    }
  }
}
