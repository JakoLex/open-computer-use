/**
 * CLI indicator — replaces Electron's rainbow border.
 *
 * When an agent is running a task, show an animated spinner with status
 * text in the terminal so the user knows the daemon is active.
 */

import ora from 'ora'
import chalk from 'chalk'

let spinner: ReturnType<typeof ora> | null = null
let isActive = false

/** Start the CLI indicator with the given message. */
export function startIndicator(message: string = 'Agent is working...'): void {
  if (isActive) return
  isActive = true

  spinner = ora({
    text: chalk.green.bold('● ') + chalk.dim(message),
    color: 'green',
    spinner: 'dots',
  })
  spinner.start()
}

/** Stop the CLI indicator and restore the terminal prompt. */
export function stopIndicator(): void {
  if (!isActive || !spinner) {
    isActive = false
    return
  }

  spinner.text = chalk.dim('Agent idle')
  spinner.suffixText = ''
  setTimeout(() => {
    if (spinner) {
      spinner.stop()
      spinner = null
      isActive = false
      // Move to next line so subsequent console output doesn't overwrite
      process.stdout.write('\n')
    }
  }, 1000)
}

/** Update the indicator message while running. */
export function updateIndicator(message: string): void {
  if (isActive && spinner) {
    spinner.text = chalk.green.bold('● ') + chalk.dim(message)
  }
}

/** Check if the indicator is currently active. */
export function isActiveState(): boolean {
  return isActive
}
