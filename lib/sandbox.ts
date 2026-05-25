import path from "path"

const BLOCKED_PATTERNS = [
  /rm\s+-rf/,
  /sudo\s+rm/,
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\s*\{/,
  /chmod\s+777\s+\//,
  />\s*\/dev\/null/,
  />\s*\/etc\/passwd/,
  />\s*\/etc\/shadow/,
]

const ALLOWED_BASH_COMMANDS = [
  "ls", "cat", "pwd", "whoami", "df", "ps", "top", "uptime", "uname",
  "git status", "git log", "git diff", "git branch", "git remote -v",
  "find", "grep", "head", "tail", "wc", "du", "which", "echo",
  "npm", "pnpm", "yarn", "node", "python3", "python",
]

const DANGEROUS_CHARS = /[|;`$(){}[\]<>]/

function isPathWithin(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase
}

export function isBlockedCommand(command: string): boolean {
  const trimmed = command.trim()

  // Check blocked patterns
  if (BLOCKED_PATTERNS.some((p) => p.test(trimmed))) {
    return true
  }

  // Check dangerous shell characters
  if (DANGEROUS_CHARS.test(trimmed)) {
    return true
  }

  // Extract first word
  const firstWord = trimmed.split(/\s+/)[0]
  if (!ALLOWED_BASH_COMMANDS.some((cmd) => firstWord === cmd || trimmed.startsWith(cmd + " "))) {
    return true
  }

  return false
}

export function sanitizePath(inputPath: string): { safe: boolean; resolved: string } {
  const resolved = path.resolve(inputPath)
  const home = process.env.HOME || process.env.USERPROFILE || process.cwd()
  const cwd = process.cwd()

  // Must be within home or cwd
  const withinHome = isPathWithin(home, resolved)
  const withinCwd = isPathWithin(cwd, resolved)

  if (!withinHome && !withinCwd) {
    return { safe: false, resolved }
  }

  return { safe: true, resolved }
}
