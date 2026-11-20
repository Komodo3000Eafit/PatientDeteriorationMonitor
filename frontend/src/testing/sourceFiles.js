// Test helpers for the TS-12 guard tests (not shipped). Node builtins only.
// See specs/012-ui-foundation/contracts/helpers-and-guards.md.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

// This file lives at frontend/src/testing/sourceFiles.js, so src/ is one level up.
const SRC_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

const SOURCE_EXTENSIONS = ['.css', '.js', '.jsx']

function hasSourceExtension(name) {
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

// Every .css/.js/.jsx file under frontend/src/ (recursively) as { path, text }.
// `path` is relative to src/ and uses forward slashes so failure messages are
// portable (e.g. 'components/Button.module.css'). `text` is the UTF-8 content.
// Everything is listed (test files and the testing/ folder included); each guard
// test does its own filtering.
export function listSourceFiles() {
  const files = []

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && hasSourceExtension(entry.name)) {
        const rel = relative(SRC_DIR, full).split(sep).join('/')
        files.push({ path: rel, text: readFileSync(full, 'utf8') })
      }
    }
  }

  walk(SRC_DIR)
  return files
}

// Replace every CSS comment with the same number of newlines it spanned, so the
// text keeps its original line count and line numbers stay accurate.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    const newlines = match.split('\n').length - 1
    return '\n'.repeat(newlines)
  })
}

// Reads frontend/src/styles/tokens.css and returns a Map from token name
// (with the leading '--') to its trimmed raw value, e.g. '--color-text' → '#1E293B'.
export function readTokens() {
  const text = readFileSync(join(SRC_DIR, 'styles', 'tokens.css'), 'utf8')
  const clean = stripComments(text)
  const tokens = new Map()
  const declarationRe = /(--[\w-]+)\s*:\s*([^;]+);/g
  let match
  while ((match = declarationRe.exec(clean)) !== null) {
    tokens.set(match[1], match[2].trim())
  }
  return tokens
}

// Removes CSS comments, then returns { property, value, line } for each
// `property: value` declaration. `line` is the 1-based line in the ORIGINAL text
// where the property name appears, so failure messages can cite a real line.
export function cssDeclarations(text) {
  const clean = stripComments(text)
  const declarations = []
  const declarationRe = /([\w-]+)\s*:\s*([^;{}]*?)\s*(?=[;}])/g
  let match
  while ((match = declarationRe.exec(clean)) !== null) {
    const property = match[1].trim()
    const value = match[2].trim()
    if (value === '') continue
    const line = clean.slice(0, match.index).split('\n').length
    declarations.push({ property, value, line })
  }
  return declarations
}
