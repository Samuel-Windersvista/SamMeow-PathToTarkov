# PathToTarkov / InteractableExfilsAPI / LootingBots / SAIN 综合优化实施计划

> 版本：v1.0
> 生成时间：2026-06-23
> 关联报告：
> - `docs/superpowers/reports/path-to-tarkov-optimization-report.md`
> - `docs/superpowers/reports/interactable-exfils-api-optimization-report.md`
> - `docs/superpowers/reports/looting-bots-optimization-report.md`
> - `docs/superpowers/reports/sain-optimization-report.md`
> - `docs/superpowers/reports/sain-lootingbots-coordination-report.md`

---

## 1. 文档目的

本文档将四个模组的优化审查报告综合为一份可执行的实施计划，明确：

- 每阶段目标与验收标准；
- 每项任务的负责仓库、优先级、依赖关系；
- 跨模组协同的接口与顺序；
- 测试、回退与发布策略。

在 Overseer 审阅并确认后，再按阶段分步实施。

---

## 2. 总体目标

1. **根除撤离无响应 bug**：确保 PathToTarkov 调用 `LocalGame.Stop` 时，即使 LootingBots 或其他 AI 模组在清理阶段抛异常，玩家仍能正常撤离。
2. **稳定 LootingBots 生命周期**：修复缓存清理、空引用、集合语法等基础问题，避免战局切换时状态残留。
3. **修复 SAIN + LootingBots 协同**：解决 bot 搜刮时发呆、战斗反应慢、小队守望乱跑等玩家可见问题。
4. **加固 IEAPI 事件与资源管理**：隔离事件 handler 异常、复用触发器、修复 MonoBehaviour 生命周期问题。
5. **性能与可维护性提升**：降低听觉/感知系统 GC 压力，减少重复反射调用，清理魔法数字与注释代码。

---

## 3. 实施原则

- **文档先行**：每个 Phase 开始前更新本计划，记录实际改动与偏差。
- **小步快跑**：优先合并高优先级修复，避免一次性大重构。
- **跨仓库协调**：若改动涉及接口契约（如 SAIN 调用 LootingBots 的反射方法），需两边同步修改并验证。
- **测试驱动**：每阶段必须有对应的日志/游戏内验证步骤，未验证不进入下一阶段。
- **可回退**：所有改动保留原始逻辑注释或配置开关，便于快速关闭新行为。

---

## 4. Phase 划分

### Phase 0：已完成的 Hotfix（撤离无响应 bug）

| 仓库 | 文件 | 改动摘要 | 状态 |
|---|---|---|---|
| PathToTarkov | `PTT-Plugin/Services/CustomExfilService.cs` | 增加 `PerformLocalGameStop` 封装，异常时延迟一帧重试 | 已完成 |
| PathToTarkov | `PTT-Plugin/UI/ExfilPrompt.cs` | 修复 `_transitVoted` 设置顺序：先清空委托、再执行、成功后置位 | 已完成 |
| LootingBots | `LootingBots/Patches/RemoveLootingBrainPatch.cs` | 增加 `__instance == null \|\| __instance.GetPlayer == null` 防御 | 已完成 |

**验收**：
- [ ] 单人战局通过 PathToTarkov 撤离，`LogOutput.log` 无 `NullReferenceException` 出自 `RemoveLootingBrainPatch`；
- [ ] 若 `localGame.Stop` 首次失败，能看到延迟重试日志并成功撤离；
- [ ] `ExfilPrompt` 在确认动作异常时不会把 UI 卡在确认页。

---

### Phase 1：稳定性加固（Critical，建议立即执行）

#### 1.1 PathToTarkov

| 编号 | 任务 | 文件 | 说明 |
|---|---|---|---|
| PTT-1.1 | 修复 `LoadExfilSettings` MongoID 计算 | `PTT-Plugin/Patches/InitAllExfiltrationPointsPatch.cs` | 当前 `Array.IndexOf + 1` 后又 `+ 1`，改为直接用索引 `i + 1` |
| PTT-1.2 | 增强 `TransitTo` 异常保护 | `PTT-Plugin/Services/CustomExfilService.cs` | 对 `Transit.Create` 与 `Transit(...)` 加 try-catch，失败回退 |
| PTT-1.3 | 改进 `ExfilPromptService` 生命周期 | `PTT-Plugin/Services/ExfilPromptService.cs` | 用 `Clear()` 代替重新赋值字典；增加 `Dispose()` 反注册事件 |
| PTT-1.4 | `ExfiltrationPointAwakePatch` 类型识别 | `PTT-Plugin/Patches/ExfiltrationPointAwakePatch.cs` | 用反射获取 `CustomExfilTrigger` 实际类型而非字符串比较 |
| PTT-1.5 | Fika 投票生命周期 | `PTT-Fika/Services/TransitVoteService.cs` | 清理离线玩家投票；`ForceAddValue` 改为标准字典赋值；`GetMyPlayerNetId` 返回 nullable |

#### 1.2 InteractableExfilsAPI

| 编号 | 任务 | 文件 | 说明 |
|---|---|---|---|
| IEAPI-1.1 | 事件 handler 异常隔离 | `Singletons/InteractableExfilsService.cs` | 对每个订阅者调用使用 try/finally，确保 `LockedRefreshPrompt` 重置 |
| IEAPI-1.2 | `CustomExfilTrigger` 复用 | `Patches/GetAvailableActionsPatch.cs` | 复用 `InteractableExfilsSession.CustomExfilTriggers`，避免重复创建 GameObject |
| IEAPI-1.3 | `InteractableExfilsSession` 构造器迁移 | `Components/InteractableExfilsSession.cs` | 将构造器逻辑移到 `Awake()` |
| IEAPI-1.4 | `CustomExfilTrigger` session 空值保护 | `Components/CustomExfilTrigger.cs` | `Awake` 中检查 session 为 null 则禁用组件 |
| IEAPI-1.5 | 反射调用健壮性 | `Patches/GetAvailableActionsPatch.cs` | 对 `methodInfo.Invoke` 加 try-catch，缓存为委托 |

#### 1.3 LootingBots

| 编号 | 任务 | 文件 | 说明 |
|---|---|---|---|
| LB-1.1 | 完整修复 `RemoveLootingBrainPatch` 清理 | `LootingBots/Patches/RemoveLootingBrainPatch.cs` | 即使 `GetPlayer == null`，仍执行 `ActiveLootCache.Cleanup` 与 `ActiveBotCache.Remove` |
| LB-1.2 | 修正集合初始化语法 | `LootingBots/Utilities/LootCache.cs`、`ActiveBotCache.cs` | 将 `= []` 替换为 `new List/Dictionary` |
| LB-1.3 | 防止 `ActiveLoot` key 冲突 | `LootingBots/Utilities/LootCache.cs` | 使用索引赋值或 `TryAdd` |
| LB-1.4 | `ActiveBotCache` 去重 | `LootingBots/Utilities/ActiveBotCache.cs` | 添加前 `Has()` 判断或改用 `HashSet` |
| LB-1.5 | 增加 `LocalGame.Stop` 清理路径 | `LootingBots/Patches/CleanCacheOnRaidEndPatch.cs` | 监听战局结束事件，确保缓存重置 |

#### 1.4 SAIN

| 编号 | 任务 | 文件 | 说明 |
|---|---|---|---|
| SAIN-1.1 | 反射互操作异常保护 | `Layers/Extract/LootingBotsInterop.cs` | 所有 `Invoke` 加 try-catch，失败禁用接口 |
| SAIN-1.2 | 统一 LootingBots 可用状态 | `Layers/Extract/LootingBotsInterop.cs`、`Classes/Decision/SquadDecisionClass.cs` | 用单一 `IsAvailable` 替代 `ModDetection.LootingBotsLoaded` |
| SAIN-1.3 | `SAINLootingBotsIntegration` 单例化 | `Components/BotComponent.cs` | 提升为 BotComponent 单例，统一更新 |
| SAIN-1.4 | 修复 `shallLootingOverwatch` fallback | `Classes/Decision/SquadDecisionClass.cs` | 移除对静止队友的误判兜底 |
| SAIN-1.5 | 实现 `LootingOverwatch` 动作 | `Layers/Combat/Squad/CombatSquadLayer.cs`、新增 Action | 新增守望动作并在 switch 中注册 |

**Phase 1 验收**：
- [ ] 四仓库编译通过；
- [ ] 单/多人战局正常开始与结束，无新增异常；
- [ ] 战局结束后 `ActiveLootCache` / `ActiveBotCache` / `CustomExfilTriggers` 被清空；
- [ ] SAIN bot 在小队成员搜刮时不再乱跑，能就地警戒；
- [ ] 反射接口任一方法失败时不会崩溃，而是降级为不可用。

---

### Phase 2：SAIN + LootingBots 深度协同（High）

| 编号 | 任务 | 负责仓库 | 说明 |
|---|---|---|---|
| SAIN-2.1 | 扩展 `CheckLootingVigilance` 威胁来源 | SAIN | 监听枪声、子弹飞过、队友报告，0.5s 内触发中断 |
| SAIN-2.2 | 改进 `TryEnsureSafeLootingPosition` | SAIN | 检查最近危险声音、已知敌人、掩体距离 |
| SAIN-2.3 | 战后拾取与 `POST_COMBAT_RECOVERY` 解耦 | SAIN | 增加独立战后拾取计时器与开关 |
| SAIN-2.4 | `FullOnLoot` 允许回落 | SAIN | 物品价值下降或背包变化时重置为 false |
| SAIN-2.5 | LootingBots 提供“搜刮中”事件或查询接口 | LootingBots | 若可行，增加 `IsBotInLootAnimation` 等更细粒度 API |
| LB-2.1 | `PreventBotFromLooting` 尝试取消当前动作 | LootingBots | 收到阻止请求时，若正在拾取动画则尽快退出 |

**Phase 2 验收**：
- [ ] 关闭 `POST_COMBAT_RECOVERY` 后，bot 战后仍会触发搜刮；
- [ ] bot 开始拾取后从侧翼开枪，能在 0.5s 内中断并进入战斗；
- [ ] bot 不会在开阔地/危险声音附近开始搜刮；
- [ ] 丢弃高价值物品后，bot 不再错误地因“满战利品”撤离。

---

### Phase 3：性能优化（Medium）

| 编号 | 任务 | 负责仓库 | 说明 |
|---|---|---|---|
| SAIN-2.5补 | `IsBotInLootAnimation` 反射补齐 | SAIN | 解析 `LootingBots.External.IsBotInLootAnimation` 并加入 `IsAvailable` guard |
| SAIN-3.1 | 听觉延迟协程改批量队列 | SAIN | `BotHearingClass.PlayAISound` 不再每声源启动协程 |
| SAIN-3.2 | 听觉缓存排序优化 | SAIN | 避免 `List.Sort` 委托分配，考虑阈值分组替代全排序 |
| SAIN-3.3 | 决策频率自适应 | SAIN | 远距离/待机降至 1-2Hz，近距交火提升至 20-30Hz |
| LB-3.1 | `IgnoredLootIds` 改 HashSet | LootingBots | 将 `List<string>` 改为 `HashSet<string>` |
| IEAPI-3.1 | 触发器复用与统一清理 | IEAPI | 避免高频创建 GameObject，战局结束统一销毁 |
| SAIN-3.4 | 价格缓存 LRU | SAIN | `LootingBotsInterop` 60 秒全清改 LRU |

**Phase 3 验收**：
- [ ] 高 bot 密度场景下帧率无显著下降；
- [ ] Unity Profiler 中 `Coroutine` / `WaitForSeconds` / `List.Sort` 分配减少；
- [ ] 长时间战局后内存增长趋势平稳。

---

### Phase 4：可维护性重构与清理（Low，可长期进行）

| 编号 | 任务 | 负责仓库 | 说明 |
|---|---|---|---|
| PTT-4.1 | `ApplyExfilFiltering` 复杂度优化 | PathToTarkov | 用 `HashSet<string>` 替代 O(n^2) 匹配 |
| SAIN-4.1 | 纯 null-guard Harmony Patch 改用 Finalizer | SAIN | 减少 Prefix 数量，降低维护面 |
| SAIN-4.2 | 提取魔法数字到配置 | SAIN | 将 `25f`、`15f`、`10f` 等阈值集中到 settings |
| SAIN-4.3 | 清理注释代码 | SAIN | 删除长期不用的调试注释块 |
| SAIN-4.4 | 非关键子类初始化失败不整体 Dispose | SAIN | `BotComponent.InitClasses` 分级处理 |
| LB-4.1 | `CleanCacheOnRaidEndPatch` 完善 | LootingBots | 统一所有战局结束入口的清理 |
| IEAPI-4.1 | `CustomExfilTrigger` Collider 类型通用化 | IEAPI | 支持 `SphereCollider`、`MeshCollider` 等 |

**Phase 4 验收**：
- [ ] 代码行数与 Patch 数量净减少；
- [ ] 所有阈值可配置或命名常量化；
- [ ] SPT 版本升级时 Patch 核对清单可用。

---

## 5. 跨仓库依赖关系

```
Phase 1
├── PathToTarkov 撤离异常保护 依赖 ──> LootingBots 清理不抛异常（LB-1.1）
├── IEAPI 事件异常隔离 依赖 ──> PathToTarkov handler 不再互相影响
└── SAIN 反射保护 依赖 ──> LootingBots API 保持稳定

Phase 2
├── SAIN CheckLootingVigilance 扩展 依赖 ──> LootingBots 提供/保持可中断接口（LB-2.1）
└── SAIN LootingOverwatch 动作 依赖 ──> SAIN-1.5 完成

Phase 3 / Phase 4
└── 各仓库内部优化，无强跨仓库依赖
```

**关键路径**：
LB-1.1 -> PTT-1.x 验证撤离稳定性
SAIN-1.3 -> SAIN-1.4 -> SAIN-1.5 -> SAIN-2.x 验证搜刮协同
IEAPI-1.1 -> PTT-1.3 验证事件隔离

---

## 6. 测试与验收矩阵

| 场景 | 涉及仓库 | 测试方法 | 通过标准 |
|---|---|---|---|
| 单人 PTT 撤离 | PTT + LB | 进入战局，使用 PTT 撤离点 | 成功撤离，无 `RemoveLootingBrainPatch` NRE，无 `localGame.Stop failed` 死循环 |
| 多人 Fika 投票撤离 | PTT-Fika | 2+ 玩家投票、断线、主机死亡 | 投票结果正确，离线玩家投票被清理 |
| IEAPI 事件异常隔离 | IEAPI + PTT | 人为让某 handler 抛异常 | 其他 handler 仍执行，UI 不锁死 |
| 战后搜刮 | SAIN + LB | 击杀敌人后观察 bot 行为 | 战后 10s 内开始扫描战利品 |
| 搜刮中遇袭 | SAIN + LB | bot 拾取时从侧翼开枪 | 0.5s 内中断拾取并转向敌人 |
| 小队守望 | SAIN | 小队成员搜刮时观察其他 bot | 就地警戒，不跑向队长 |
| 长时间战局内存 | 全部 | 连续多局游戏 | 内存无异常增长，日志无重复 key 异常 |

---

## 7. 风险与回退方案

| 风险 | 影响 | 回退方案 |
|---|---|---|
| SAIN `LootingOverwatch` 新动作导致 bot 卡住 | 高 | 临时在 `CombatSquadLayer` 中将 `LootingOverwatch` 映射回 `RegroupAction` |
| LootingBots `PreventBotFromLooting` 强制中断导致物品丢失 | 中 | 增加配置开关关闭 SAIN 中断逻辑 |
| IEAPI 触发器复用改动导致交互失效 | 高 | 恢复为每次创建，但确保正确销毁 |
| PathToTarkov MongoID 改动导致撤离点设置错位 | 高 | 回退到原计算，加注释说明；同时与原生逻辑对齐验证 |
| SAIN 反射保护导致 LootingBots 功能静默失效 | 中 | 增加详细 warning 日志，手动降级时可见 |

---

## 8. 时间线建议

| 阶段 | 预计工期 | 说明 |
|---|---|---|
| Phase 0 | 已完成 | 撤离无响应 hotfix |
| Phase 1 | 2-3 天 | 四仓库稳定性加固，可并行 |
| Phase 2 | 2-3 天 | SAIN + LootingBots 协同，需联调 |
| Phase 3 | 3-5 天 | 性能优化，需 Profiling 验证 |
| Phase 4 | 持续 | 重构与清理，低优先级 |

> 注：以上工期为单人/小团队静态估计，实际取决于编译环境与游戏测试效率。

---

## 9. 分工建议

| 仓库 | 主要负责人 | 当前状态 |
|---|---|---|
| PathToTarkov | Overseer / 维护者 | Phase 0 已完成部分 |
| InteractableExfilsAPI | Overseer / 维护者 | 待 Phase 1 开始 |
| LootingBots | Overseer / 维护者 | Phase 0 已完成部分 |
| SAIN | Overseer / 维护者 | 待 Phase 1 开始 |

---

## 10. 参考文档

- 各仓库根目录 `docs/superpowers/reports/` 下的五份优化审查报告。
- 本计划存档位置：各仓库根目录 `docs/superpowers/implementation-plan.md`。

---

## 11. 修订记录

| 版本 | 时间 | 修订内容 |
|---|---|---|
| v1.0 | 2026-06-23 | 初始版本，综合四份优化报告 |

---

*本计划由 Vault-Tec Automated Research Terminal VT-OS/OPENCODE 生成，等待 Overseer 审阅后执行。*
