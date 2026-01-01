import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import { checkForUpdates, getCurrentVersion, displayUpdateHint } from '../utils/version.js';

export async function checkUpdate(): Promise<void> {
  const spinner = ora({
    text: 'Checking for updates...',
    color: 'cyan'
  }).start();

  const result = await checkForUpdates(true); // Force check

  spinner.stop();

  console.log('\n' + chalk.bold.cyan('📦 llmd Version Info\n'));
  console.log(`Current version: ${chalk.white(`v${result.currentVersion}`)}`);

  if (result.error && !result.latestVersion) {
    console.log(chalk.yellow(`\n⚠️  Could not check for updates: ${result.error}`));
    console.log(chalk.dim('Check your internet connection and try again.\n'));
    return;
  }

  if (result.latestVersion) {
    console.log(`Latest version:  ${chalk.green(`v${result.latestVersion}`)}`);
  }

  if (result.hasUpdate) {
    displayUpdateHint(result);
  } else if (result.latestVersion) {
    console.log(chalk.green('\n✓ You are on the latest version!\n'));
  }
}

export async function installUpdate(): Promise<void> {
  const spinner = ora({
    text: 'Checking for updates...',
    color: 'cyan'
  }).start();

  const result = await checkForUpdates(true);
  spinner.stop();

  if (result.error && !result.latestVersion) {
    console.log(chalk.yellow(`\n⚠️  Could not check for updates: ${result.error}`));
    console.log(chalk.dim('Check your internet connection and try again.\n'));
    return;
  }

  if (!result.hasUpdate) {
    console.log(chalk.green('\n✓ You are already on the latest version!'));
    console.log(chalk.dim(`  Current: v${result.currentVersion}\n`));
    return;
  }

  console.log(
    chalk.cyan('\n📦 Updating llmd: ') +
    chalk.dim(`v${result.currentVersion}`) +
    chalk.cyan(' → ') +
    chalk.green(`v${result.latestVersion}`) +
    '\n'
  );

  // Determine the package manager (npm is default for global installs)
  const updateSpinner = ora({
    text: 'Installing update...',
    color: 'cyan'
  }).start();

  try {
    await runNpmUpdate();
    updateSpinner.succeed('Update installed successfully!');
    console.log(chalk.dim('\nRun "llmd --version" to verify the update.\n'));
  } catch (error) {
    updateSpinner.fail('Failed to install update');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\nError: ${message}`));
    console.log(chalk.dim('\nTry running manually:'));
    console.log(chalk.cyan('  npm update -g llmd-cli\n'));
  }
}

function runNpmUpdate(): Promise<void> {
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['update', '-g', 'llmd-cli'], {
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

