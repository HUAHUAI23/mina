import { spawn } from 'node:child_process'
import { mkdir, rmdir } from 'node:fs/promises'
import { join } from 'node:path'

const packageRoot = join(import.meta.dir, '..')
const lockDir = join(packageRoot, 'src', '.paraglide-compile.lock')
const retryDelayMs = 100
const staleLockMs = 600_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const acquireLock = async (): Promise<void> => {
  const startedAt = Date.now()
  while (true) {
    try {
      await mkdir(lockDir)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') {
        throw error
      }
      if (Date.now() - startedAt > staleLockMs) {
        await rmdir(lockDir).catch(() => undefined)
      }
      await sleep(retryDelayMs)
    }
  }
}

const runParaglide = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'x',
        'paraglide-js',
        'compile',
        '--project',
        './project.inlang',
        '--outdir',
        './src/paraglide',
        '--emit-ts-declarations',
        '--output-structure',
        'locale-modules',
        '--strategy',
        'baseLocale',
        '--is-server',
        'typeof window === "undefined"',
      ],
      {
        cwd: packageRoot,
        stdio: 'inherit',
      },
    )
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`paraglide-js compile exited with code ${code ?? 'unknown'}`))
    })
  })

await acquireLock()
try {
  await runParaglide()
} finally {
  await rmdir(lockDir).catch(() => undefined)
}
