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
import type { GeneratedCommand, GeneratedCommandResult, VerificationResult } from '../types.js';

// Store version check result (started in background)
let versionCheckPromise: Promise<Awaited<ReturnType<typeof checkForUpdates>>> | null = null;

/**
 * Detects if a query strongly suggests the need for system probing.
 * These patterns indicate the user wants the AI to "see" something first before deciding.
 */
function queryLikelyNeedsProbe(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Patterns that suggest "pick/choose/select from existing items"
  const selectionPatterns = [
    /\b(the|find|get|show|identify)\s+(largest|biggest|smallest|newest|oldest|latest|most recent|heaviest)\b/,
    /\blargest\s+(file|folder|directory|process)\b/,
    /\bsmallest\s+(file|folder|directory)\b/,
    /\bmost\s+(recent|memory|cpu|active)\b/,
    /\blatest\s+(file|commit|tag|version|branch)\b/,
    /\boldest\s+(file|folder|directory)\b/,
  ];
  
  // Patterns that suggest "decide based on current state"
  const statePatterns = [
    /\bbased\s+on\s+(the\s+)?(current|existing)\b/,
    /\bdepending\s+on\s+(what|which|the)\b/,
    /\bif\s+(there|it|the file|the folder)\s+(is|exists|are)\b/,
    /\bcheck\s+(if|what|which|whether)\b.*\bthen\b/,
  ];
  
  // Patterns indicating embedded subshell discovery (which should be avoided)
  const embeddedDiscoveryPatterns = [
    /\b(delete|remove|open|edit|run|execute|kill)\s+(the\s+)?(largest|smallest|newest|oldest|latest|first|last)\b/,
    /\b(pick|choose|select|find)\s+(one|the right|the correct|the best)\b/,
  ];
  
  // NEW: Patterns that suggest SEMANTIC ANALYSIS or CLASSIFICATION
  // These require AI judgment, not grep/regex
  const semanticAnalysisPatterns = [
    // Similarity/resemblance queries
    /\b(look|looks|looking)\s+(like|similar|alike)\b/,
    /\b(similar|resemble|resembles|resembling)\s+(to|an?|the)?\b/,
    /\b(named|names)\s+(like|after|similar)\b/,
    /\b(sound|sounds)\s+like\b/,
    
    // Classification/categorization queries
    /\b(animal|city|country|person|people|color|fruit|food|plant)\s*(name|names|like|looking)?\b.*\b(file|folder|director)/i,
    /\bfile\s*(name)?s?\b.*\b(animal|city|country|person|color|fruit)\b/i,
    /\b(categorize|classify|identify|recognize|detect)\b.*\b(file|folder|name)/i,
    /\bwhich\s+(file|folder|name)s?\s+(are|look|seem|appear)\b/,
    
    // "Are there any X that Y" patterns requiring judgment
    /\bare\s+there\s+(any|some)\b.*\b(similar|like|named|looking|resembl)/i,
    /\b(any|some)\s+(file|folder|name)s?\s+(that|which)\s+(look|seem|appear|resemble|sound)/i,
    
    // Pattern/meaning-based queries
    /\b(meaningful|suspicious|strange|weird|odd|interesting|important)\s+(file|folder|name)/i,
    /\b(file|folder|name)s?\s+(that|which)\s+(seem|look|appear|might be|could be)\b/i,
    /\b(related\s+to|associated\s+with|connected\s+to)\b/,
    
    // Semantic search in filenames
    /\bfile\s*names?\b.*\b(here|this\s+directory|this\s+folder)\b.*\?/i,
    /\b(here|this\s+directory|this\s+folder)\b.*\bfile\s*names?\b.*\?/i,
  ];
  
  // Check all pattern groups
  const allPatterns = [
    ...selectionPatterns, 
    ...statePatterns, 
    ...embeddedDiscoveryPatterns,
    ...semanticAnalysisPatterns
  ];
  
  for (const pattern of allPatterns) {
    if (pattern.test(lowerQuery)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detects if a generated command contains embedded discovery logic
 * that should have been done via probing instead.
 */
function hasEmbeddedDiscoveryLogic(command: string): boolean {
  const patterns = [
    // Subshell with sorting/head for extraction
    /\$\(.*find.*\|.*sort.*\|.*head/,  // $(find ... | sort | head)
    /\$\(.*ls.*\|.*sort.*\|.*head/,     // $(ls ... | sort | head)
    /\$\(.*ps.*\|.*sort.*\|.*head/,     // $(ps ... | sort | head)
    /`.*find.*\|.*sort.*\|.*head/,      // backtick version
    /`.*ls.*\|.*sort.*\|.*head/,
    /\$\(.*\|\s*(head|tail)\s+-\d/,     // Any subshell with head/tail extraction
    
    // NEW: Hardcoded grep lists (attempt at semantic classification via regex)
    // This catches patterns like: ls | grep -E "cat|dog|lion|tiger"
    /\|\s*grep\s+(-[iE]+\s+)?["']?[\w]+\|[\w]+\|[\w]+/,  // 3+ items in alternation
    /\|\s*egrep\s+["']?[\w]+\|[\w]+\|[\w]+/,
    /\|\s*grep\s+-[iE]*\s+-[iE]*\s+["']?[\w]+\|[\w]+/,
    
    // Long grep -E patterns (likely hardcoded lists)
    /grep\s+(-[iEo]+\s+)*["'][^"']{30,}["']/,  // grep with 30+ char pattern
    
    // Nested command substitution for discovery
    /\$\(.*\$\(.*\)\s*\)/,
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(command)) {
      return true;
    }
  }
  
  return false;
}

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
    text: 'Generating command...',
    color: 'cyan'
  }).start();

  try {
    let generated: GeneratedCommand;

    if (enableInfoGathering) {
      // Use info gathering enabled generation
      const result = await llmService.generateCommandWithInfoGathering(query);
      
      if (result.needsInfo) {
        // AI wants to gather more information
        spinner.stop();
        const infoResult = await handleInfoGathering(query, result.probeCommand, result.reason);
        
        if (infoResult === null) {
          // User cancelled or probe failed, fall back to regular generation
          spinner.start('Generating command without additional info...');
          generated = await llmService.generateCommand(query);
        } else if (infoResult === 'skip') {
          // User wants to skip info gathering, use regular generation
          spinner.start('Generating command...');
          generated = await llmService.generateCommand(query);
        } else {
          // Got gathered info, generate with context
          spinner.start('Generating command with gathered information...');
          generated = await llmService.generateCommandWithContext(query, infoResult);
        }
      } else {
        // Model returned a direct command - but check if it should have probed
        const command = result.command;
        const shouldHaveProbed = queryLikelyNeedsProbe(query) && hasEmbeddedDiscoveryLogic(command);
        
        if (shouldHaveProbed) {
          // The model embedded discovery logic when it should have probed first
          spinner.stop();
          
          // Offer user the option to gather info first
          const probeChoice = await offerProbeOption(query, command, result.explanation);
          
          if (probeChoice === 'probe') {
            // User wants to probe first - retry with explicit probe instruction
            spinner.start('Gathering system information first...');
            const forcedProbe = await llmService.generateCommand(
              `First, run a read-only command to discover the answer, then I'll ask you again. Query: ${query}`
            );
            spinner.stop();
            
            // Execute the discovery command
            const probeResult = await handleForcedProbe(forcedProbe.command);
            if (probeResult) {
              spinner.start('Generating command with gathered information...');
              generated = await llmService.generateCommandWithContext(query, probeResult);
            } else {
              generated = { command, explanation: result.explanation };
            }
          } else {
            // User accepts the embedded discovery command
            generated = { command, explanation: result.explanation };
          }
        } else {
          // Direct command response - no issues
          generated = { command, explanation: result.explanation };
        }
      }
    } else {
      // Regular generation without info gathering
      generated = await llmService.generateCommand(query);
    }

    spinner.text = 'Verifying command...';

    // Verify command
    const verification = await verifyCommand(generated.command, query);
    spinner.stop();

    // Check if this is an informational response (AI verified)
    if (verification.isInformationalResponse && verification.extractedMessage) {
      // For informational responses, show in beautiful box
      // Include clarification info if needed, but still show the message
      const clarificationInfo = verification.needsClarification ? {
        issues: verification.result.issues,
        questions: verification.result.suggestedQuestions
      } : undefined;
      
      await displayInformationalMessage(query, generated, verification.result, verification.extractedMessage, clarificationInfo);
    } else if (verification.needsClarification) {
      // Handle low confidence for non-informational commands - ask for clarification
      await handleClarification(query, generated, verification.result);
    } else {
      // Display and potentially execute command
      await displayAndExecute(query, generated, verification.result);
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

/**
 * Offers the user an option to probe first when the model generated
 * a command with embedded discovery logic.
 */
async function offerProbeOption(
  query: string,
  command: string,
  explanation: string
): Promise<'probe' | 'continue'> {
  const content = chalk.yellow.bold('💡 Recommendation\n\n') +
    chalk.white('This command includes embedded discovery logic. For better accuracy,\n') +
    chalk.white('I can first gather the actual data from your system, then generate\n') +
    chalk.white('a simpler command with the specific values.\n\n') +
    chalk.dim('Current command:\n') +
    chalk.cyan(`  $ ${command.length > 80 ? command.substring(0, 77) + '...' : command}`);

  console.log('\n' + boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: 'yellow',
    title: '🔍 Gather Info First?',
    titleAlignment: 'left'
  }));

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'Would you like me to gather the actual data first?',
      choices: [
        { name: 'Yes, gather info first (recommended)', value: 'probe' },
        { name: 'No, use the command as-is', value: 'continue' }
      ],
      default: 'probe'
    }
  ]);

  return action as 'probe' | 'continue';
}

/**
 * Executes a probe command for forced probing scenario.
 * Returns the gathered info or null if failed/cancelled.
 */
async function handleForcedProbe(probeCommand: string): Promise<string | null> {
  // Verify the command is safe
  const safetyCheck = isProbeCommandSafe(probeCommand);
  
  if (!safetyCheck.safe) {
    console.log(chalk.yellow('\n⚠️  Could not safely probe. Proceeding with original command.\n'));
    return null;
  }

  console.log(chalk.dim(`\nRunning: ${probeCommand}\n`));

  try {
    const result = await executeCommand(probeCommand);
    
    let gatheredInfo = result.stdout || '';
    if (result.stderr && result.exitCode !== 0) {
      gatheredInfo += '\n[stderr]: ' + result.stderr;
    }

    if (result.exitCode === 0) {
      console.log(chalk.green('✓ Information gathered\n'));
    }

    // Truncate if too long
    const maxInfoSize = 4000;
    if (gatheredInfo.length > maxInfoSize) {
      gatheredInfo = gatheredInfo.substring(0, maxInfoSize) + '\n...(truncated)';
    }

    return gatheredInfo || '(no output)';
  } catch (error) {
    console.log(chalk.yellow('\n⚠️  Probe failed. Proceeding with original command.\n'));
    return null;
  }
}

const MAX_PROBE_RETRIES = 3;

/**
 * Asks the AI for a safer probe command after previous attempts were rejected.
 */
async function retrySaferProbe(
  originalQuery: string,
  previousFailures: string[]
): Promise<{ needsInfo: true; probeCommand: string; reason: string } | { needsInfo: false } | null> {
  try {
    const failureContext = previousFailures
      .map((f, i) => `  ${i + 1}. ${f}`)
      .join('\n');
    
    const retryQuery = `${originalQuery}

IMPORTANT: Your previous probe command(s) were rejected for safety reasons:
${failureContext}

Please suggest a DIFFERENT, SAFE read-only probe command. Only use these safe commands:
- ls, ls -la, ls -lt, tree, find (without -exec that modifies), du, df
- cat, head, tail, grep, wc (read-only)
- git status, git branch, git log, git ls-files, git diff (read-only git commands)
- ps, ps aux, uname, whoami, pwd, env, printenv
- stat, file, which, whereis

DO NOT use: rm, mv, cp, chmod, chown, sudo, pipes to write commands, output redirection (>, >>), or any command that modifies files.

If you cannot gather the information safely, respond with needsInfo: false and provide your best guess command.`;

    const result = await llmService.generateCommandWithInfoGathering(retryQuery);
    
    if (result.needsInfo) {
      return {
        needsInfo: true,
        probeCommand: result.probeCommand,
        reason: result.reason
      };
    } else {
      return { needsInfo: false };
    }
  } catch (error) {
    console.log(chalk.dim('Failed to get retry suggestion from AI.\n'));
    return null;
  }
}

async function handleInfoGathering(
  originalQuery: string,
  probeCommand: string,
  reason: string,
  retryCount: number = 0,
  previousFailures: string[] = []
): Promise<string | null | 'skip'> {
  // First, verify the probe command is safe
  const safetyCheck = isProbeCommandSafe(probeCommand);
  
  if (!safetyCheck.safe) {
    console.log('\n' + chalk.yellow('⚠️  The requested probe command is not safe:'));
    console.log(chalk.dim(`  Command: ${probeCommand}`));
    console.log(chalk.dim(`  Reason: ${safetyCheck.reason}`));
    
    // Track this failure
    const failureInfo = `Command "${probeCommand}" was rejected: ${safetyCheck.reason}`;
    const allFailures = [...previousFailures, failureInfo];
    
    if (retryCount < MAX_PROBE_RETRIES) {
      // Ask AI for a safer probe command
      console.log(chalk.cyan(`\nRetrying with a safer command (attempt ${retryCount + 1}/${MAX_PROBE_RETRIES})...\n`));
      
      const retryResult = await retrySaferProbe(originalQuery, allFailures);
      
      if (retryResult && retryResult.needsInfo) {
        // Got a new probe command, recursively try it
        return handleInfoGathering(
          originalQuery,
          retryResult.probeCommand,
          retryResult.reason,
          retryCount + 1,
          allFailures
        );
      } else if (retryResult && !retryResult.needsInfo) {
        // AI decided to generate command directly instead
        console.log(chalk.dim('AI will generate the command without probing.\n'));
        return 'skip';
      }
    }
    
    // Max retries reached or retry failed
    console.log(chalk.yellow(`\nMax retries (${MAX_PROBE_RETRIES}) reached. Falling back to generating command without additional info.\n`));
    return null;
  }

  // Display the info gathering request
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
    
    // Combine stdout and stderr for complete picture
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

    // Limit gathered info size to avoid token limits
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

async function displayInformationalMessage(
  query: string,
  generated: GeneratedCommand,
  verification: VerificationResult,
  message: string,
  clarificationNeeded?: { issues?: string[]; questions?: string[] }
): Promise<void> {
  // Build beautiful content for the green box
  let content = chalk.green.bold(message);
  
  // If clarification is needed, add it beautifully
  if (clarificationNeeded) {
    if (clarificationNeeded.issues && clarificationNeeded.issues.length > 0) {
      content += '\n\n' + chalk.yellow('⚠️  Note:');
      clarificationNeeded.issues.forEach(issue => {
        content += '\n' + chalk.dim(`   ${issue}`);
      });
    }
    
    if (clarificationNeeded.questions && clarificationNeeded.questions.length > 0) {
      content += '\n\n' + chalk.cyan('💭 I could help better if you clarify:');
      clarificationNeeded.questions.forEach((q, i) => {
        content += '\n' + chalk.dim(`   ${i + 1}. ${q}`);
      });
    }
  }

  // Display in a beautiful green box
  console.log('\n' + boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: 'green',
    title: '💬 Response',
    titleAlignment: 'left'
  }));

  // Track in session (informational response, not executed)
  sessionManager.addCommand(
    query,
    generated,
    verification,
    undefined, // No execution result - this is just an informational response
    process.cwd()
  );

  // Ask if user wants to continue with another command
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
    // Prompt for next command
    const { nextQuery } = await inquirer.prompt<{ nextQuery: string }>([
      {
        type: 'input',
        name: 'nextQuery',
        message: 'What would you like to do?'
      }
    ]);

    if (nextQuery.trim()) {
      await runCommand(nextQuery);
    }
  } else {
    console.log(chalk.dim('\nGoodbye!\n'));
  }
}

async function handleClarification(
  originalQuery: string,
  generated: GeneratedCommand,
  verification: VerificationResult
): Promise<void> {
  console.log('\n' + chalk.yellow('⚠️  The command needs clarification:\n'));
  
  // Show current command
  console.log(chalk.dim('Generated command:'));
  console.log(chalk.cyan(`  $ ${generated.command}\n`));
  
  // Show confidence
  console.log(chalk.dim(`Confidence: ${verification.confidence}% (threshold: ${configManager.getConfidenceThreshold()}%)\n`));

  // Show issues
  const issues = formatVerificationIssues(verification);
  if (issues.length > 0) {
    console.log(chalk.yellow('Issues:'));
    issues.forEach(issue => console.log(chalk.dim(`  ${issue}`)));
    console.log();
  }

  // Show suggested questions
  const questions = formatSuggestedQuestions(verification);
  if (questions.length > 0) {
    console.log(chalk.cyan('Please clarify:'));
    questions.forEach(q => console.log(chalk.dim(`  ${q}`)));
    console.log();
  }

  // Ask for more info
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
      {
        type: 'input',
        name: 'additionalInfo',
        message: 'Add more details:'
      }
    ]);

    if (additionalInfo.trim()) {
      const enhancedQuery = `${originalQuery}. Additional context: ${additionalInfo}`;
      await runCommand(enhancedQuery);
    }
  } else if (action === 'run') {
    await displayAndExecute(originalQuery, generated, verification);
  }
}

async function displayAndExecute(
  query: string,
  generated: GeneratedCommand,
  verification: VerificationResult
): Promise<void> {
  // Check severity
  const severity = checkSeverity(generated.command);
  const severityEmoji = getSeverityEmoji(severity.level);

  // Build display content
  let content = chalk.bold.white(`$ ${generated.command}`);
  
  if (generated.explanation) {
    content += '\n\n' + chalk.dim(generated.explanation);
  }

  content += '\n\n' + chalk.dim(`Confidence: ${verification.confidence}%`);
  content += chalk.dim(` • Provider: ${llmService.getProviderName()}`);

  // Add severity warning if needed
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

  // Display command box
  console.log('\n' + boxen(content, {
    padding: 1,
    margin: 0,
    borderStyle: 'round',
    borderColor: severity.level === 'critical' ? 'red' : 
                 severity.level === 'high' ? 'yellow' : 'cyan',
    title: 'Generated Command',
    titleAlignment: 'left'
  }));

  // Determine confirmation style based on severity
  if (requiresConfirmation(severity.level)) {
    // Dangerous command - require explicit confirmation
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
      // Track in session
      sessionManager.addCommand(
        query,
        generated,
        verification,
        {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr
        },
        process.cwd()
      );
    } else {
      console.log(chalk.dim('\nCommand cancelled.\n'));
      // Track cancelled command (no execution)
      sessionManager.addCommand(
        query,
        generated,
        verification,
        undefined,
        process.cwd()
      );
    }
  } else {
    // Safe command - normal flow
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
      // Track in session
      sessionManager.addCommand(
        query,
        generated,
        verification,
        {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr
        },
        process.cwd()
      );
    } else if (action === 'edit') {
      const { editedCommand } = await inquirer.prompt<{ editedCommand: string }>([
        {
          type: 'input',
          name: 'editedCommand',
          message: 'Edit command:',
          default: generated.command
        }
      ]);

      if (editedCommand.trim()) {
        // Check severity of edited command
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
            // Track cancelled edited command
            sessionManager.addCommand(
              query,
              { ...generated, command: editedCommand },
              verification,
              undefined,
              process.cwd()
            );
            return;
          }
        }
        const result = await execute(editedCommand);
        // Track edited command in session
        sessionManager.addCommand(
          query,
          { ...generated, command: editedCommand },
          verification,
          {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr
          },
          process.cwd()
        );
      }
    } else {
      console.log(chalk.dim('\nCommand cancelled.\n'));
      // Track cancelled command
      sessionManager.addCommand(
        query,
        generated,
        verification,
        undefined,
        process.cwd()
      );
    }
  }
}

async function execute(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  console.log(chalk.dim('\nExecuting...\n'));
  
  const result = await executeCommand(command);
  
  if (result.exitCode === 0) {
    console.log(chalk.green('\n✓ Command completed successfully\n'));
  } else {
    console.log(chalk.yellow(`\n⚠️  Command exited with code ${result.exitCode}\n`));
  }

  // Show update hint if available (non-blocking, won't delay if not ready)
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
