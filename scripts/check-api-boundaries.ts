import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

interface BoundaryViolation {
  file: string
  message: string
}

const rootDir = process.cwd()

const sourceExtensions = new Set(['.ts', '.tsx'])

const extensionOf = (filePath: string): string => {
  const index = filePath.lastIndexOf('.')
  return index === -1 ? '' : filePath.slice(index)
}

const listSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path))
      continue
    }
    if (sourceExtensions.has(extensionOf(path))) {
      files.push(path)
    }
  }

  return files
}

const read = (filePath: string): string => readFileSync(filePath, 'utf8')

const toRelative = (filePath: string): string => relative(rootDir, filePath)

const hasImportFrom = (source: string, specifier: string): boolean =>
  source.includes(`from '${specifier}'`) || source.includes(`from "${specifier}"`)

const hasImportMatching = (source: string, pattern: RegExp): boolean => pattern.test(source)

const violations: BoundaryViolation[] = []

const addViolation = (file: string, message: string): void => {
  violations.push({ file: toRelative(file), message })
}

const apiFiles = listSourceFiles(join(rootDir, 'apps/api/src'))
for (const file of apiFiles) {
  const source = read(file)
  const relativeFile = toRelative(file)

  if (hasImportFrom(source, '@mina/contracts')) {
    addViolation(file, 'API code must import contracts through module subpath exports.')
  }

  if (
    relativeFile.includes('/modules/') &&
    (relativeFile.endsWith('.service.ts') ||
      relativeFile.endsWith('/domain.ts') ||
      relativeFile.endsWith('/pricing.ts') ||
      relativeFile.endsWith('/resources.ts') ||
      relativeFile.endsWith('/retry.ts') ||
      relativeFile.endsWith('/task-config.ts') ||
      relativeFile.endsWith('/media-selection.ts') ||
      relativeFile.endsWith('/run-state.ts')) &&
    hasImportMatching(source, /from ['"]hono(?:\/[^'"]*)?['"]/)
  ) {
    addViolation(file, 'Module services, domain files, and pure utilities must not import Hono.')
  }

  if (
    (relativeFile.endsWith('/domain.ts') ||
      relativeFile.endsWith('/pricing.ts') ||
      relativeFile.endsWith('/resources.ts') ||
      relativeFile.endsWith('/retry.ts') ||
      relativeFile.endsWith('/task-config.ts') ||
      relativeFile.endsWith('/media-selection.ts') ||
      relativeFile.endsWith('/run-state.ts')) &&
    hasImportMatching(source, /from ['"].*(?:\/config\/env|\/db\/|\/providers\/|drizzle-orm|postgres|@aws-sdk)/)
  ) {
    addViolation(file, 'Domain and pure utility files must not import env, db, provider, or vendor infrastructure.')
  }
}

const webSrc = join(rootDir, 'apps/web/src')
for (const file of listSourceFiles(webSrc)) {
  const source = read(file)
  if (hasImportMatching(source, /from ['"](?:\.\.\/)*\.\.\/api\/src\//) || source.includes('apps/api/src/')) {
    addViolation(file, 'Web code must not import API implementation internals.')
  }
}

if (violations.length > 0) {
  console.error('API boundary check failed:')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.message}`)
  }
  process.exit(1)
}

console.log('API boundary check passed.')
