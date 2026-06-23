# Path to Tarkov

将 Tarkov 的各个地图通过撤离点连接起来，构建开放世界体验；引入多仓库系统和基于玩家离线位置的商人访问控制。

<img src="./LOGO.jpg" alt="PTT LOGO" width="125">

[VT-OS] 版本 6.1.0 | 目标 SPT ~3.11.4 | 混合 Server + Client 模组

---

## 目录

- [项目概述](#项目概述)
- [功能说明](#功能说明)
- [仓库结构](#仓库结构)
- [运行时流程](#运行时流程)
- [核心组件](#核心组件)
- [配置说明](#配置说明)
- [构建指南](#构建指南)
- [安装指南](#安装指南)
- [兼容性](#兼容性)
- [推荐模组](#推荐模组)
- [截图](#截图)
- [故障报告](#故障报告)
- [致谢](#致谢)

---

## 项目概述

Path to Tarkov (PTT) 是一个 SPT (Single Player Tarkov) 模组，通过在服务端 (TypeScript) 和客户端 (C# / BepInEx) 两层协同工作，为 Tarkov 引入"离线位置" (offraid position) 概念。玩家每次撤离后所在的位置决定了下一次进入战局时可用的地图、出生点、仓库、藏身处功能和商人访问权限，从而模拟出一个真实连续的开放世界体验。

---

## 功能说明

### 离线位置 (Offraid Position)
PTT 的核心概念。每次玩家通过 PTT 撤离点离开战局后，其"离线位置"会被更新。玩家的所有后续状态（地图解锁、出生点、仓库、商人）均由该位置决定。离线位置持久化保存在玩家档案中，支持多玩家独立状态 (Fika 兼容)。

### 动态地图访问
基于离线位置动态锁定或解锁地图。只有与当前位置连通的地图才能被选择进入。地图选择界面上被锁定的地图会显示为灰色，并带有 PTT 定制提示。

### 动态出生点
每次进入战局时，服务器根据玩家的离线位置动态调整出生点列表。PTT 自带的 spawn point 配置 (`shared_player_spawnpoints.json5`) 和每个配置目录中的 `additional_player_spawnpoints.json5` 共同决定可用出生点。

### 多仓库系统 (Multi-Stash)
默认启用，可在 `UserConfig.json5` 中关闭。玩家的主仓库仅当处于允许的位置时才可用；否则会被替换为一个容量受限的次级仓库 (secondary stash)，甚至一个空仓库 (零容量)。藏身处功能也会相应锁定。

### 商人访问控制 (Trader Gating)
基于离线位置锁定商人。只有处于商人所在区域的玩家才能与其交易。支持第三方模组添加的商人。还支持保险、维修和医疗功能的按位置启用/禁用。跳蚤市场支持三种模式：全区域可用、按位置启用、完全禁用。

### 撤离点重制 (Exfil Overhaul)
PTT 完全替换了原版撤离点系统。每个撤离点提供两种选项：
- **撤离 (Extract)**：退出战局并更新离线位置到指定地点。
- **传送 (Transit)**：直接传送到另一张地图的指定出生点，保留装备和状态（不经过离线位置更新）。

撤离点提示 UI 完全重写，显示下一站地图、可用商人等信息。

### 传送与撤离的区分 (Transit vs Extract)
PTT 区分两种退出方式：
- **Extract**：结束战局，更新离线位置，结算战利品，重置藏身处/商人状态。
- **Transit**：结束当前战局，但立即进入另一张地图的 raid，保留装备、任务进度和 raid 内状态（例如血量、弹药）。

### Fika 多玩家支持
PTT 完全兼容 [Fika](https://github.com/project-fika) 多人联机模组。每位玩家拥有独立的离线位置。服务器端和客户端均包含 Fika 模块（`PTT-Fika/`），支持合作模式下的同步。PTT 在手势轮 (quick menu) 中提供 Fika 投票系统来选择传送目标。

### 品质生活特性
- **Found-In-Raid 修正**：当玩家通过转移或传送得到装备时，自动标记装备为 FIR (Found In Raid)，防止任务进度受阻。
- **战局内限制调整**：可配置携带更多货币进行旅行。
- **跑刀判定禁用**：禁用跑刀 (Run Through) 状态，避免误判。
- **藏身处恢复控制**：基于位置的 hydration / energy / health 恢复开关。

---

## 仓库结构

| 目录 / 文件 | 说明 |
|---|---|
| `src/` | 服务端模组源代码 (TypeScript)，编译为 `src/mod.js` |
| `PTT-Plugin/` | 客户端 BepInEx 插件 (C#)，处理 UI、撤离提示、商人隐藏等 |
| `PTT-Packets/` | 客户端-服务端通信数据包定义 (C# 类库) |
| `PTT-Fika/` | Fika 多人联机支持模块 (C#) |
| `configs/` | 预设配置目录，每个子目录为一个完整 PTT 配置 |
| `docs/` | 文档：FAQ、配置手册、教程、卸载说明、bug 报告模板 |
| `tests/` | Jest 单元测试 |
| `scripts/` | 构建脚本、安装脚本、文档生成脚本 |
| `release/` | 发行版 ZIP 归档输出目录 |
| `external-resources/` | SPT 数据提取工具生成的额外地图撤离点数据 |
| `types/` | SPT 类型定义补充 |
| `ALL_EXFILS.md` | 所有原版撤离点名列表 |

---

## 运行时流程

以下是 PTT 从加载到一次完整 raid 周期的执行流程：

```
SPT 服务端启动
  |
  +-> mod.ts.preSptLoad()
  |     - 加载 UserConfig.json5 (若不存在则自动创建)
  |     - 加载选中配置目录下的 config.json5
  |     - 加载 shared_player_spawnpoints.json5 + additional_player_spawnpoints.json5
  |     - 创建 PathToTarkovController、EndOfRaidController、EventWatcher
  |     - 注册静态路由 (CurrentLocationData, Version)
  |     - 对配置执行静态分析 (config-analysis.ts)
  |     - 若启用商人限制，执行 fix-repeatable-quests
  |
  +-> mod.ts.postDBLoad()
  |     - 设置跳蚤市场全局配置 (setEarlyRagFairConfig)
  |     - 注入撤离点 tooltip 多语言字符串
  |
  +-> mod.ts.postSptLoad()
        - 创建公开 API (createPathToTarkovAPI)
        - 初始化商人控制器和次级仓库模板
        - 注入撤离提示模板和离线位置显示名称到 locales

客户端启动
  |
  +-> Plugin.Awake()
  |     - HTTP 获取服务端版本号，检查版本一致性
  |     - 检测 InteractableExfilsAPI 和 Fika 是否安装
  |     - 注册所有 Harmony 补丁 (撤离点、商人面板、计时器等)
  |     - 初始化 CurrentLocationDataService
  |     - 初始化 IEApiWrapper (InteractableExfilsAPI 包装层)
  |
  +-> Plugin.GameStarted()
        - 触发 Fika 模块初始化

玩家选择地图 -> raid 开始
  |
  +-> 服务端: EventWatcher.watchStartOfRaid()
  |     - PathToTarkovController.syncLocationBase()
  |       - 根据离线位置更新出生点列表
  |       - 根据 config.exfiltrations 重写撤离点列表
  |       - 根据 config 开关控制原生传送点
  |
  +-> 客户端: Plugin.RaidStarted()
        - HTTP GET /PathToTarkov/CurrentLocationData
        - 服务端返回该地图所有撤离点的目标列表 (exfilsTargets)
        - ExfilPromptService 接管撤离交互
        - 禁用非 PTT 配置的撤离点

玩家在战局内
  |
  +-> ExfilPromptService 处理撤离点交互
        - 玩家走到撤离点 -> 显示 PTT 定制的提示窗口
        - 选择 Extract -> 记录目标离线位置
        - 选择 Transit -> 记录目标地图和出生点
        - 在 Fika 模式下支持队伍投票

玩家撤离/死亡
  |
  +-> 客户端: Plugin.RaidEnded()
  |     - 发送 endLocalRaid 请求到服务端
  |     - exitName 编码了提取目标 (格式: "ExitName.OffraidPosition" 或 "ExitName.MapName.SpawnPointId")
  |
  +-> 服务端: EventWatcher.watchEndOfRaid()
        - 解析 exitName 中的目标信息
        - 恢复原始 exitName 传递给原版逻辑
        - 调用 EndOfRaidController.end()
          - 若玩家死亡 -> onPlayerDies() (可选重置离线位置)
          - 若 Extract -> onPlayerExtracts() 更新离线位置
          - 若 Transit -> 保留 raid cache 用于下一场 raid
        - 更新仓库 (StashController.updateStash)
        - 更新商人锁定状态 (TradersController.updateTraders)
```

---

## 核心组件

### 服务端 (TypeScript, `src/`)

| 组件 | 文件 | 职责 |
|---|---|---|
| PathToTarkovController | `path-to-tarkov-controller.ts` | 核心控制器。管理所有玩家状态的初始化、离线位置更新、地图/出生点/撤离点同步、跳蚤市场限制、藏身处与全局配置覆写。通过 DI 覆写 `LocationController.generateAll`、`DataCallbacks.getTemplateItems`、`DataCallbacks.getHideoutAreas`、`DataCallbacks.getGlobals` |
| EndOfRaidController | `end-of-raid-controller.ts` | 处理 raid 结束事件：判断死亡/提取/传送，分发到对应处理器 |
| StashController | `stash-controller.ts` | 管理主仓库与次级仓库的切换。在数据库中注册次级仓库模板 (Item Templates)，在玩家档案中动态切换 `inventory.stash` |
| TradersController | `traders-controller.ts` | 初始化商人配置 (保险、维修、治疗)，基于离线位置动态锁定/解锁商人 |
| EventWatcher | `event-watcher.ts` | 通过路由窥探和 DI 覆写捕捉游戏事件 (game start、profile create、raid start、raid end)，维护 raid cache |
| ExfilsTooltipsTemplater | `services/ExfilsTooltipsTemplater.ts` | 生成撤离点 tooltip 的多语言模板字符串 |
| TradersAvailabilityService | `services/TradersAvailabilityService.ts` | 判断商人是否因任务锁而不可用 |
| Config Analysis | `config-analysis.ts` | 静态分析配置，检测循环引用、缺失的撤离点目标等 |
| Routes | `routes/` | `CurrentLocationData` (客户端获取当前地图撤离目标)、`Version` (版本检查) |

### 客户端 (C# / BepInEx, `PTT-Plugin/`)

| 组件 | 文件 | 职责 |
|---|---|---|
| Plugin | `Plugin.cs` | 入口点。版本检查、依赖检测、Harmony 补丁注册、Fika 模块初始化 |
| CurrentLocationDataService | `Services/CurrentLocationDataService.cs` | 向服务端请求当前地图的撤离目标数据 (`/PathToTarkov/CurrentLocationData`) |
| ExfilPromptService | `Services/ExfilPromptService.cs` | 接管 InteractableExfilsAPI 的撤离交互，显示 PTT 定制的多选项提示框，要求手动确认 |
| CustomExfilService | `Services/CustomExfilService.cs` | 管理 PTT 自定义撤离逻辑 (包括 Fika 投票) |
| CurrentExfilTargetService | `Services/CurrentExfilTargetService.cs` | 缓存当前选中的撤离目标，供 UI 使用 |
| IEApiWrapper | `Services/IEApiWrapper.cs` | InteractableExfilsAPI 的包装层，提供类型安全的 API 访问 |
| FikaBridge | `Services/FikaBridge.cs` | Fika 集成桥接层 |
| ExfilPrompt (UI) | `UI/ExfilPrompt.cs` | 多选项撤离提示窗口的 UI 逻辑 |
| ExfilTooltip (UI) | `UI/ExfilTooltip.cs` | 定制化的撤离点 tooltip UI |
| InitAllExfiltrationPointsPatch | `Patches/InitAllExfiltrationPointsPatch.cs` | 重写撤离点初始化流程，应用 PTT 过滤 |
| ExfiltrationPointAwakePatch | `Patches/ExfiltrationPointAwakePatch.cs` | 在撤离点 Awake 时注册 PTT 标签和状态 |
| HideLockedTraderPatch | `Patches/HideLockedTraderPatch.cs` | 隐藏被锁定的商人卡片和面板 |
| ExitTimerPanelPatch | `Patches/ExitTimerPanelPatch.cs` | 处理撤离计时器面板的 PTT 定制 |
| ScavExfiltrationPointPatch | `Patches/ScavExfiltrationPointPatch.cs` | 使 Scav 撤离点对 PMC 可用 |

### 网络数据包 (C#, `PTT-Packets/`)

| 文件 | 说明 |
|---|---|
| `PerformExfilPacket.cs` | 客户端 -> 服务端的撤离请求数据包 |
| `PlayerVotedForExfilTargetPacket.cs` | Fika 投票数据包 |
| `DisableTransitVotePacket.cs` | 禁用传送投票数据包 |
| `RawExfilTarget.cs` | 撤离目标原始数据定义 |

### InteractableExfilsAPI 集成
PTT 依赖 [InteractableExfilsAPI](https://hub.sp-tarkov.com/files/file/2286-interactable-exfils-api) (>= 2.0.0) 实现客户端撤离交互。`ExfilPromptService` 接管了 IEAPI 的 `OnActionsAppliedEvent`，替换默认的 Extract 切换逻辑为 PTT 的选项提示。同时禁用原版自动撤离去激活，要求玩家手动选择目标。

---

## 配置说明

PTT 的配置体系分为三个层级：

### UserConfig.json5 (`configs/UserConfig.json5`)
用户个人配置文件，首次启动服务端时自动生成。包含 gameplay 开关：

```js5
{
  selectedConfig: 'Default',         // 选中的 PTT 配置目录名
  gameplay: {
    multistash: true,                // 启用多仓库系统
    tradersAccessRestriction: true,  // 启用商人位置限制
    resetOffraidPositionOnPlayerDeath: true, // 死亡时重置离线位置
    playerScavMoveOffraidPosition: false,    // PMC 离线位置随 Scav 移动
    keepFoundInRaidTweak: true,      // 装备自动标记 FIR
    fleaMarketMode: 'location_based', // 'everywhere' | 'location_based' | 'disabled'
    fleaMarketMinLevel: 15,          // 跳蚤市场最低等级
  },
  runUninstallProcedure: false,
}
```

### Config.json5 (`configs/<SelectedConfig>/config.json5`)
每个预设配置目录下的主配置文件。定义：
- `initial_offraid_position` / `respawn_at`：初始位置与重生位置
- `infiltrations`：每个离线位置可进入的地图和出生点
- `exfiltrations`：每个地图的撤离点及其目标 (格式: `"ExtractName": ["OffraidPosition", "MapName.SpawnPointId"]`)
- `traders_config`：商人位置限制和附加配置
- `hideout_secondary_stashes`：次级仓库列表
- `offraid_regen_config`：基于位置的恢复控制
- `override_by_profiles`：按玩家档案模板覆写初始位置

### 出生点配置
- `configs/shared_player_spawnpoints.json5`：所有配置共享的通用出生点定义（不随配置分发，位于 `src/do_not_distribute/`）
- `configs/<SelectedConfig>/additional_player_spawnpoints.json5`：配置专属的额外出生点

### 更多文档
- [用户配置手册](./docs/USER_CONFIG_MANUAL.md)
- [如何创建配置](./docs/HOW_TO_CREATE_CONFIG.md)
- [从零创建配置教程](./docs/TUTORIAL_CONFIG.md)
- [PTT 配置规范](./docs/specification/README.md)
- [如何添加自定义出生点](./docs/HOW_TO_ADD_PLAYER_SPAWNPOINTS.md)
- [所有可用原版撤离点](./ALL_EXFILS.md)
- [共享出生点配置](./configs/shared_player_spawnpoints.json5)
- [常见问题](./docs/FAQ.md)

---

## 构建指南

### 前置依赖

- Node.js >= 18 (推荐 20.x)
- npm >= 9
- .NET SDK 8.0 (用于构建客户端插件)
- SPT 3.11.x 开发环境 (`@spt/` 类型包)

### 命令

```bash
# 安装依赖
npm install

# 编译服务端 (TypeScript -> JavaScript)
npm run build

# 编译客户端插件
npm run build:client

# 编译全部 + 生成文档 + 生成撤离点数据
npm run build:all

# 构建发行版 ZIP (清理 -> 构建全部 -> 准备文件 -> 打包 -> Git 状态检查)
npm run build:release

# 开发模式快速安装到 SPT 目录
npm run dev:install    # 等效于 build + build:client + install:files

# 运行测试
npm test

# 代码检查
npm run lint
npm run prettier:check
```

### 项目脚本说明

| 脚本 | 功能 |
|---|---|
| `build` | TypeScript 编译 |
| `build:client` | `dotnet build` 编译 BepInEx 插件 |
| `build:exfils` | 从 SPT 数据生成所有原版撤离点列表 |
| `build:docs` | 生成 ALL_EXFILS.md 文档 |
| `build:release` | 完整构建并打包为发行版 ZIP |
| `clean` | 清理编译产物 |
| `prepare:files` | 准备发行目录结构 |
| `install:files` | 安装文件到 SPT 目录 |
| `zip:files` | 打包发行版 ZIP |

---

## 安装指南

1. **前置依赖**：确保已安装 [Interactable Exfils API](https://hub.sp-tarkov.com/files/file/2286-interactable-exfils-api/#overview) (>= 2.0.0)
2. **安装 PTT**：将发行版 ZIP 解压到 SPT 根目录，合并 `user/` 和 `BepInEx/` 文件夹
3. **首次启动**：启动 SPT 服务端，PTT 会自动生成 `configs/UserConfig.json5`
4. **可选**：编辑 `configs/UserConfig.json5` 选择预设配置 (修改 `selectedConfig` 字段)

### 卸载
请参考 [卸载指南](./docs/HOW_TO_UNINSTALL.md)。将 `UserConfig.json5` 中的 `runUninstallProcedure` 设为 `true` 后启动服务端即可自动清理。

---

## 兼容性

| 依赖 | 版本要求 |
|---|---|
| SPT | ~3.11.4 |
| InteractableExfilsAPI | >= 2.0.0 |
| Fika (可选) | >= 1.1.5 |
| Kaeno Trader Scrolling (可选) | 任意 (PTT 提供了兼容补丁) |

PTT 通过 `Plugin.cs` 在启动时自动检测依赖版本，版本不匹配会在游戏内以通知形式警告。

---

## 推荐模组

- [Dynamic Maps](https://hub.sp-tarkov.com/files/file/1981-dynamic-maps/)：学习撤离点位置的得力工具，与 PTT 配置完美兼容。
- [Leave It There (LIT)](https://hub.sp-tarkov.com/files/file/2572-leave-it-there/)：PTT 的理想伴侣模组。你可以在战局中放置物品，这些物品会在多次 raid 中持续存在，直到你捡起为止。

---

## 截图

### 地图锁定
<img src="./docs/screenshots/PTT_HIDDEN_MAPS.png" alt="地图锁定" width="600">

### 撤离点提示
<img src="./docs/screenshots/PTT_EXFIL_PROMPT.png" alt="撤离点提示" width="600">

### 撤离点 Tooltip
<img src="./docs/screenshots/PTT_EXFIL_TOOLTIPS.png" alt="撤离点 Tooltip" width="600">

### 商人锁定
<img src="./docs/screenshots/PTT_HIDDEN_TRADERS.png" alt="商人锁定" width="600">

### Dynamic Maps 兼容
<img src="./docs/screenshots/PTT_DYNAMIC_MAPS.png" alt="Dynamic Maps 兼容" width="600">

---

## 预设配置

PTT 自带多套预设配置，存放在 `configs/` 目录下：

| 配置目录 | 说明 |
|---|---|
| `Default/` | 官方默认配置，包含所有 PTT 功能的完整开放世界路径。首次使用者推荐 |
| `DevilFlippy/` | 社区配置 |
| `LinearPath/` | 线性路径配置 |
| `Slum_K1ng/` | 社区配置 |
| `TrapTransits/` | 侧重传送机制的配置 |
| `PathToTarkovReloaded/` | PTT Reloaded 配置 |
| `LegacyPathToTarkovV4/` | 旧版 V4 配置 (保留兼容) |
| `LegacyPathToTarkovV5/` | 旧版 V5 配置 (保留兼容) |
| `OriginalNarcoticsConfig/` | Narcotics 原始配置 |
| `Examples/` | 示例配置 |

选择配置：编辑 `configs/UserConfig.json5`，修改 `selectedConfig` 字段为目标目录名。

### 默认配置地图
![默认配置地图](./configs/Default/TarkovOpenWorld.jpg)

> 如果你想为 PTT 贡献新的默认配置地图图片，欢迎提交 PR。

---

## 故障报告

如果你需要报告 bug，请先阅读 [如何报告 Bug](./docs/HOW_TO_REPORT_A_BUG.md) 以获取必要的信息模板。

- [计划功能](https://github.com/guillaumearm/PathToTarkov/issues?q=is%3Aopen+is%3Aissue+label%3Afeature)
- [已知问题](https://github.com/guillaumearm/PathToTarkov/issues?q=is:open+is:issue+label:bug)

---

## 致谢

- 感谢 SPT 团队
- 感谢 Fika 团队
- 感谢 [Jehree](https://hub.sp-tarkov.com/user/32691-jehree/) 开发 Interactable Exfils API，并允许 PTT 复用其 Traveler 模组的 voucher 功能；以及引导作者进入客户端模组开发
- 感谢 [Fontaine](https://hub.sp-tarkov.com/user/9277-fontaine/) 贡献了使 Scav 撤离点对 PMC 可用的补丁
- 感谢 [GrooveypenguinX](https://hub.sp-tarkov.com/user/34125-grooveypenguinx/) 提供了客户端侧隐藏商人的补丁
- 感谢 [rockahorse](https://hub.sp-tarkov.com/user/25630-rockahorse/) 和 [GrooveypenguinX](https://hub.sp-tarkov.com/user/34125-grooveypenguinx/) 继续维护 Path To Tarkov Reloaded
- 感谢 [Theta](https://hub.sp-tarkov.com/user/17203-theta/) 制作了第一版路径地图图片，以及 adudewithbadaim 制作了第二版地图
- 感谢 [r1ft](https://hub.sp-tarkov.com/user/11960-r1ft/) 的贡献 (以及旧版附加模组 PTT Extracts Requirements 和 Dynamic Time Cycle)
- 感谢 [gabe_over](https://hub.sp-tarkov.com/user/18108-gabe-over/) 制作 Single Player Overhaul (SPO) 模组
- 感谢 [Narcotics](https://hub.sp-tarkov.com/user/56420-narcotics/) 的代码贡献
- 感谢 [averyc1876](https://hub.sp-tarkov.com/user/63831-averyc1876/) 提供 drawio 路径图 (PTT 5.2.0)
- 感谢所有帮助改进 Path To Tarkov 体验的玩家和贡献者

---

<p align="center">
  <em>Vault-Tec 不对任何因未遵循卸载指南导致的存档损坏负责。</em><br>
  <em>Path To Tarkov - 为 Tarkov 打造更好的未来... 地下世界。</em>
</p>

---

如果你想要支持我的工作，可以 [请我喝杯咖啡](https://ko-fi.com/trapcodien)。

[![ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Me-FF5E5B?style=flat-square&logo=ko-fi)](https://ko-fi.com/trapcodien)
