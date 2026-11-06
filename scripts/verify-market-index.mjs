#!/usr/bin/env node
/**
 * Offline validation of market/index.json against the DSH plugin market
 * format 1 rules that matter for publication.
 *
 * The authoritative validator lives in @deepseek-ai/dsh-plugin-market-index;
 * this script mirrors its structural rules so CI fails fast without needing
 * the harness installed.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'market', 'index.json')

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u
const COMMIT = /^[0-9a-f]{40}$/u

const problems = []
const fail = (where, reason) => problems.push(`${where}: ${reason}`)

const doc = JSON.parse(readFileSync(file, 'utf8'))

if (doc.format !== 1) fail('$.format', 'must be 1')

function localized(value, where) {
  if (typeof value === 'string') {
    if (!value.trim()) fail(where, 'must be non-empty')
    return
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(where, 'must be a string or a language map')
    return
  }
  if (!value.en) fail(where, 'must contain en')
}

localized(doc.title, '$.title')
if (doc.description !== undefined) localized(doc.description, '$.description')

if (!Array.isArray(doc.plugins) || doc.plugins.length === 0) fail('$.plugins', 'must be a non-empty array')

const names = new Set()
for (const [i, plugin] of (doc.plugins || []).entries()) {
  const at = `$.plugins[${i}]`
  if (typeof plugin.name !== 'string' || !PACKAGE_NAME.test(plugin.name)) fail(`${at}.name`, 'must be an npm package name')
  if (names.has(plugin.name)) fail(`${at}.name`, 'duplicate name')
  names.add(plugin.name)

  if (plugin.title !== undefined) localized(plugin.title, `${at}.title`)
  if (plugin.description !== undefined) localized(plugin.description, `${at}.description`)

  const category = plugin.metadata?.category
  if (category !== undefined && !doc.metadata?.categories?.[category]) {
    fail(`${at}.metadata.category`, 'references an undeclared category')
  }
  for (const label of plugin.metadata?.labels || []) {
    if (!doc.metadata?.labels?.[label]) fail(`${at}.metadata.labels`, `references undeclared label ${label}`)
  }

  if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
    fail(`${at}.versions`, 'must be a non-empty array')
    continue
  }
  for (const [j, version] of plugin.versions.entries()) {
    const vAt = `${at}.versions[${j}]`
    if (!SEMVER.test(version.version)) fail(`${vAt}.version`, 'must be an exact SemVer version')
    if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0) {
      fail(`${vAt}.publishTimestamp`, 'must be Unix seconds')
    }
    const source = version.source
    if (!source || (source.type !== 'npm' && source.type !== 'git')) {
      fail(`${vAt}.source.type`, 'must be npm or git')
      continue
    }
    if (source.type === 'git') {
      if (!COMMIT.test(source.commit || '')) fail(`${vAt}.source.commit`, 'must be a 40-hex commit')
      if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/.test(source.url || '')) {
        fail(`${vAt}.source.url`, 'must be an https repository URL with owner and repo')
      }
    }
    const range = version.engines?.dsh
    if (range !== undefined) {
      if (typeof range !== 'string' || !range.trim()) fail(`${vAt}.engines.dsh`, 'must be a SemVer range')
      if (String(range).startsWith('workspace:')) fail(`${vAt}.engines.dsh`, 'must not be a workspace range')
    }
  }
}

if (problems.length > 0) {
  console.error(`market index invalid (${problems.length} problem(s)):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`market index OK: ${names.size} plugin(s), format 1`)
