# dsh-flash-notify

[![ci](https://github.com/HunYiSage/dsh-flash-notify/actions/workflows/ci.yml/badge.svg)](https://github.com/HunYiSage/dsh-flash-notify/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DeepSeek Harness 插件：**一轮任务跑完，任务栏按钮像收到微信消息一样持续闪烁，直到你点回来。**

适合"把窗口最小化、自己去看直播/刷视频"的场景——不用一直回头看它到底跑完了没有。

- 任务结束 → 任务栏按钮高亮闪烁（Windows），或弹一条系统通知（macOS / Linux）
- **不开机自启、无独立守护进程**：跟随 Harness 启动而加载，Harness 退出即消失
- 窗口已经在前台时不打扰
- 主会话与子代理几乎同时结束只闪一次
- 纯 Node 内置模块实现，无第三方依赖，不联网

## 平台支持

| 平台 | 效果 | 实现 |
| --- | --- | --- |
| Windows | 任务栏按钮持续闪烁，直到窗口被激活（微信式） | `FlashWindowEx(FLASHW_ALL \| FLASHW_TIMERNOFG)` |
| macOS | 通知中心横幅 | `osascript display notification` |
| Linux | 桌面通知 | `notify-send` |

Windows 优先用随包提供的 12 KB `DshFlash.exe`（`assets/win32/`，源码可审计）；文件缺失时自动退回纯 PowerShell 实现，功能一致，只是多约 0.5 s 启动开销。

## 安装

### 方式一：插件市场（推荐）

```powershell
# 1) 把本仓库的市场索引写入 desktop profile（幂等，会先备份 patch）
pwsh -File scripts/install-market.ps1

# 2) 重启 DeepSeek Harness
# 3) 插件 → 发现 → 搜索 dsh-flash-notify → 安装
```

市场索引 URL：

```
https://raw.githubusercontent.com/HunYiSage/dsh-flash-notify/main/market/index.json
```

> 市场的“发现”页来自可选组合包 `@deepseek-ai/dsh-experimental-plugin-market-bundle`。
> 若尚未启用，脚本会提示你先在插件页打开它。

### 方式二：直接装 bundle

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm add git+https://github.com/HunYiSage/dsh-flash-notify.git
```

然后把 `"dsh-flash-notify"` 追加到该 profile `package.json` 的 `dsh.profile.bundles` 数组，重启 Harness。

### 方式三：只挂插件（不装 bundle）

把仓库放进 `profiles/desktop/plugins/dsh-flash-notify/`，在自己的 `cordis.patch.yml` 里加：

```yaml
- insert:
    - id: dsh-flash-notify
      name: ./plugins/dsh-flash-notify/src/index.js
```

## 配置

默认值即可用。需要改动时在自己的 profile `cordis.patch.yml` 覆盖：

```yaml
- id: dsh-flash-notify
  config:
    message: 任务已完成
    debounceMs: 1500
    useEventBus: true
    useCacheWatcher: true
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `debounceMs` | `1200` | 触发去抖窗口（毫秒），合并子代理与双通道重复信号 |
| `message` | `Task finished` | macOS / Linux 通知正文 |
| `title` | `DeepSeek Harness` | macOS / Linux 通知标题 |
| `useEventBus` | `true` | 订阅 `session/event` 里的 `turn/end`（零延迟） |
| `useCacheWatcher` | `true` | 监听会话投影快照（不依赖内部 API 的兜底通道） |
| `cacheDir` | `~/.dsh/storages/session_projcache/sessions` | 兜底通道监视目录 |
| `logFile` | `~/.dsh/dsh-flash-notify.log` | 插件日志；`null` 关闭 |
| `win32Helper` | 包内 `assets/win32/DshFlash.exe` | 自定义 Windows 闪烁器 |
| `win32Script` | 包内 `src/win32-flash.ps1` | PowerShell 兜底脚本 |

## 工作原理

两条互相独立、互相兜底的信号，共同驱动一个去抖后的通知：

1. **事件通道**：`ctx.on('session/event')` 里的 `turn/end`。精确、零延迟；在事件可见的作用域内有效。
2. **快照通道**：DSH 把会话投影写在 `session-*.json`，其中 `turnBoundary.openTurnStartSeq` 从数字变为 `null` 的瞬间就是一轮结束。只读两个字段，一次正则，开销可以忽略。

两条通道同时命中时，`debounceMs` 把它合并为一次提醒。首次观察只记录基线，所以插件启动时不会为"早就结束的轮次"闪一下。

Windows 的闪烁用 `FLASHW_TIMERNOFG`：系统会一直高亮任务栏按钮，**直到你点开窗口**，不需要轮询或后台进程。

## 日志与排错

```powershell
Get-Content "$env:USERPROFILE\.dsh\dsh-flash-notify.log" -Tail 20
```

正常启动会看到：

```
[dsh-flash-notify] loaded pid=... platform=win32 backend=win32-helper
[dsh-flash-notify] baseline: snapshots=... tracked=...
[dsh-flash-notify] watching ...\session_projcache\sessions
```

| 现象 | 检查 |
| --- | --- |
| 日志没有 `loaded` | 插件未挂载：确认 `dsh.profile.bundles` 含本包，或 patch 条目路径正确，然后重启 |
| 有 `loaded` 但没有 `turn/end` | 两条通道都没信号：确认 `session_projcache` 目录在更新，或把 `useEventBus` 打开 |
| 闪了一下立刻停 | 窗口当时在前台（本来就不打扰）；最小化后再试 |
| 完全没有任务栏按钮 | 你是"关闭到托盘"而不是"最小化到任务栏" |

手动验证视觉效果：

```powershell
& ".\assets\win32\DshFlash.exe" flash
```

## 卸载

1. 插件 → 已安装 → 移除 `dsh-flash-notify`（或从 `dsh.profile.bundles` 删掉，`pnpm remove dsh-flash-notify`）
2. 重启 Harness
3. 删除日志 `%USERPROFILE%\.dsh\dsh-flash-notify.log`

## 开发

```powershell
node --test "test/**/*.test.mjs"          # 25 个用例，Node 18+，无依赖
node scripts/build-market-index.mjs       # 重新生成市场索引（需先 commit）
node scripts/verify-market-index.mjs      # 按索引格式 1 校验
pwsh -File scripts/build-win32-helper.ps1 # 从 C# 源码重建 Windows 闪烁器
```

目录：

```
src/index.js            cordis 插件入口（双通道路由 + 去抖）
src/turn-state.js       投影快照解析与状态机
src/cache-watcher.js    快照目录监听（兜底通道）
src/notify.js           跨平台提醒
src/win32-flash.ps1     PowerShell 兜底实现
assets/win32/           Windows 闪烁器源码与预编译产物
market/index.json       插件市场索引（格式 1）
scripts/                发布、索引、构建脚本
```

## 许可证

[MIT](LICENSE)
