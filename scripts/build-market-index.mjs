#!/usr/bin/env node
/**
 * Build the DSH plugin market index (format 1) for this repository.
 *
 * Usage:
 *   node scripts/build-market-index.mjs [--owner OWNER] [--repo REPO] [--branch BRANCH] [--source git|npm]
 *
 * The index is served from GitHub raw or GitHub Pages. Each version points at
 * a pinned Git commit so installs are reproducible, which is what the DSH
 * market validator requires.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  return value && !value.startsWith('--') ? value : fallback
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const repoUrl = String(pkg.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '')
const match = /github\.com[/:]([^/]+)\/([^/]+)$/.exec(repoUrl)
const owner = arg('--owner', match?.[1] || 'HunYiSage')
const repo = arg('--repo', match?.[2] || pkg.name)
const branch = arg('--branch', 'main')
const source = arg('--source', 'git')

const commit = git('rev-parse', 'HEAD')
const committedAt = Number(git('show', '-s', '--format=%ct', 'HEAD')) || Math.floor(Date.now() / 1000)

if (source === 'git' && !/^[0-9a-f]{40}$/.test(commit)) {
  console.error('error: need a Git commit to pin a git source; commit first, then rerun.')
  process.exit(1)
}

const dshRange = pkg.engines?.dsh || '>=0.2.0-0'

const index = {
  format: 1,
  title: {
    en: 'dsh-flash-notify',
    zh: 'DSH 任务完成提醒',
  },
  description: {
    en: 'Desktop reminders for DeepSeek Harness: flash the taskbar button (or post a notification) when a turn finishes.',
    zh: 'DeepSeek Harness 任务完成提醒：一轮任务结束时闪烁任务栏按钮或弹出系统通知。',
  },
  metadata: {
    categories: {
      notifications: { title: { en: 'Notifications', zh: '提醒通知' } },
    },
    labels: {
      windows: { title: { en: 'Windows taskbar', zh: 'Windows 任务栏' } },
      'zero-config': { title: { en: 'Works out of the box', zh: '开箱即用' } },
    },
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: {
        en: 'Taskbar flash on turn end',
        zh: '任务完成任务栏闪烁',
      },
      description: {
        en: 'Keeps the DeepSeek Harness taskbar button flashing until you come back, so a finished turn never goes unnoticed while you are watching something else. No background daemon, no auto-start; it lives and dies with the harness.',
        zh: '任务跑完后任务栏按钮持续闪烁直到你点回来，最小化去看直播也不会错过。没有常驻守护、不开机自启，跟随 Harness 启动与退出。',
      },
      icon: 'icon.svg',
      author: String(pkg.author || owner),
      homepage: String(pkg.homepage || `https://github.com/${owner}/${repo}#readme`),
      repository: { url: `https://github.com/${owner}/${repo}` },
      metadata: {
        category: 'notifications',
        keywords: ['taskbar', 'flash', 'notification', 'turn', 'done', 'deepseek-harness'],
        labels: ['windows', 'zero-config'],
        sortKeys: {},
      },
      versions: [
        {
          version: String(pkg.version),
          publishTimestamp: committedAt,
          source:
            source === 'npm'
              ? { type: 'npm' }
              : { type: 'git', url: `https://github.com/${owner}/${repo}`, commit },
          engines: { dsh: dshRange },
        },
      ],
    },
  ],
}

const out = path.join(root, 'market', 'index.json')
writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(`wrote ${path.relative(root, out)} (owner=${owner} repo=${repo} branch=${branch} source=${source})`)
console.log(`index URL: https://raw.githubusercontent.com/${owner}/${repo}/${branch}/market/index.json`)
