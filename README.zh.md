# 任务栏闪烁提示（dsh-flash-notify）

[![ci](https://github.com/246837984/D1/actions/workflows/ci.yml/badge.svg)](https://github.com/246837984/D1/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DeepSeek Harness 插件：**一轮任务跑完，任务栏图标像收到微信消息那样闪起来，你点开就熄灭。**

适合“把窗口最小化、自己去看直播/刷视频”的场景 —— 不用一直回头看它跑完没有。

- 任务结束 → 任务栏图标高亮闪烁（Windows），或弹一条系统通知（macOS / Linux）
- **点开窗口立即熄灭**；十分钟没理它也会自己熄灭，不留残余
- **不开机自启、无独立守护进程**：跟随 Harness 启动而加载，Harness 退出即消失
- 窗口已经在前台时不打扰；主会话与子代理几乎同时结束只闪一次
- 纯 Node 内置模块实现，无第三方依赖，不联网

## 平台支持

| 平台 | 效果 | 实现 |
| --- | --- | --- |
| Windows | 任务栏图标闪烁，点开即熄灭 | `FlashWindowEx(FLASHW_ALL \| FLASHW_TIMERNOFG)` + 主动 `FLASHW_STOP` |
| macOS | 通知中心横幅 | `osascript display notification` |
| Linux | 桌面通知 | `notify-send` |

Windows 优先用随包提供的 14 KB `DshFlash.exe`（`assets/win32/`，C# 源码可审计）；文件缺失时自动退回纯 PowerShell 实现，功能一致，只是多约 0.5 秒启动开销。

## 安装

### 方式一：一句话（推荐）

在 PowerShell 里粘这一行：

```powershell
irm https://raw.githubusercontent.com/246837984/D1/main/install.ps1 | iex
```

它会自己下载、放好文件、写好配置。**然后完全退出 DeepSeek Harness，再打开即生效。**

<details>
<summary>它具体做了什么（想手动照做时看这里）</summary>

1. 下载 `https://codeload.github.com/246837984/D1/zip/refs/heads/main` 并解压
2. 复制到 `%USERPROFILE%\.dsh\profiles\desktop\plugins\dsh-flash-notify\`
3. 在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 里追加（已有则跳过）：

   ```yaml
   - insert:
       - id: dsh-flash-notify
         name: ./plugins/dsh-flash-notify/src/index.js
         config:
           enabled: true
           debounceMs: 1200
   ```

4. 若你之前是用 bundle（市场）装的，它只更新文件，不动配置，不会出现两份同时运行

</details>

### 方式二：让 Agent 装

发给任意编码 Agent 一句话：

```text
安装这个 DSH 插件：https://github.com/246837984/D1
```

它会读仓库里的 `install.ps1` / README 自己完成。想更明确就这样说：

```text
下载 https://github.com/246837984/D1 到临时目录，执行根目录的 install.ps1，
然后告诉我需要重启 DeepSeek Harness。
```

### 方式三：插件市场（最后）

在「插件 → 发现」添加索引源，搜「任务栏闪烁提示」：

```
https://cdn.jsdelivr.net/gh/246837984/D1@main/market/index.json
```

它依赖可选组合包 `@deepseek-ai/dsh-experimental-plugin-market-bundle`，还得能连上 jsDelivr，所以放在最后。

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
| `startupGraceMs` | `10000` | 启动静默期：Harness 刚打开的这段时间里不做任何提醒 |
| `message` | `Task finished` | macOS / Linux 通知正文 |
| `title` | `DeepSeek Harness` | macOS / Linux 通知标题 |
| `useEventBus` | `true` | 订阅 `session/event` 里的 `turn/end`（零延迟） |
| `useCacheWatcher` | `true` | 监听会话投影快照（不依赖内部 API 的兜底通道） |
| `cacheDir` | `~/.dsh/storages/session_projcache/sessions` | 兜底通道监视目录 |
| `logFile` | `~/.dsh/dsh-flash-notify.log` | 插件日志；`null` 关闭 |
| `win32Helper` | 包内 `assets/win32/DshFlash.exe` | 自定义 Windows 闪烁器 |
| `win32Script` | 包内 `src/win32-flash.ps1` | PowerShell 兜底脚本 |

## 工作原理

两条互相独立、互相兜底的信号，共同驱动一个去抖后的提醒：

1. **事件通道**：`ctx.on('session/event')` 里的 `turn/end`。精确、零延迟。只有本次运行**先看到 `turn/start`** 之后，`turn/end` 才算数 —— 这样 Harness 启动时重放的历史事件不会误触发。
2. **快照通道**：DSH 把会话投影写在 `session-*.json`，其中 `turnBoundary.openTurnStartSeq` 从数字变为 `null` 的瞬间就是一轮结束。只读两个字段，一次正则。

两条通道同时命中时，`debounceMs` 把它合并为一次提醒。首次观察只记录基线，再加上 `startupGraceMs` 静默期，所以插件刚启动时不会为“早就结束的轮次”闪一下。

Windows 侧：先发 `FLASHW_TIMERNOFG` 让图标持续闪烁，然后**自己盯着窗口**——窗口一旦回到前台就补一条 `FLASHW_STOP` 主动熄灭（Chromium 窗口不会自己清掉这个高亮，这正是“点开了还在闪”的原因）。最多盯 10 分钟，超时也会熄灭，不留残余。

## 日志与排错

```powershell
Get-Content "$env:USERPROFILE\.dsh\dsh-flash-notify.log" -Tail 20
Get-Content "$env:USERPROFILE\.dsh\DshFlash.log" -Tail 20
```

正常启动会看到：

```
[dsh-flash-notify] loaded pid=... platform=win32 backend=win32-helper grace=10000ms
[dsh-flash-notify] baseline: snapshots=... tracked=...
[dsh-flash-notify] watching ...\session_projcache\sessions
```

一轮结束时会看到：

```
[dsh-flash-notify] turn/end (event) session=... kind=completed
[dsh-flash-notify] notify: turn-end:completed
```

| 现象 | 检查 |
| --- | --- |
| 日志没有 `loaded` | 插件未挂载：确认 patch 条目路径正确（`./plugins/dsh-flash-notify/src/index.js`），然后重启 |
| 有 `loaded` 但没有 `turn/end` | 两条通道都没信号：确认 `session_projcache` 目录在更新，或把 `useEventBus` 打开 |
| 闪了一下立刻停 | 窗口当时在前台（本来就不打扰）；最小化后再试 |
| 点开窗口后还一直亮 | 说明用的是 1.0.0；1.0.1 起会自动熄灭，重跑上面那句安装命令即可 |
| 完全没有任务栏图标 | 你是“关闭到托盘”而不是“最小化到任务栏” |

手动验证视觉效果：

```powershell
$exe = "$env:USERPROFILE\.dsh\profiles\desktop\plugins\dsh-flash-notify\assets\win32\DshFlash.exe"
& $exe flash      # 闪一次
& $exe clear      # 立刻熄灭
```

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

或手动：删掉 `plugins\dsh-flash-notify\`，再从 `cordis.patch.yml` 里去掉 `- id: dsh-flash-notify` 那两行，重启 Harness。

## 开发

```powershell
node --test                               # 26 个用例，Node 18+，无依赖
node scripts/build-market-index.mjs       # 重新生成市场索引（需先 commit）
node scripts/verify-market-index.mjs      # 按索引格式 1 校验
powershell -ExecutionPolicy Bypass -File scripts/build-win32-helper.ps1 # 从 C# 源码重建 Windows 闪烁器
```

目录：

```
install.ps1             一句话安装脚本（BOM 编码，PowerShell 5.1 必需）
src/index.js            cordis 插件入口（双通道路由 + 去抖 + 启动静默）
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