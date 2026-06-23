# Changelog — PathToTarkov

> SPT 3.11 自定义撤离点/转移模组

---

## v6.2.0 (2026-06-23) — 稳定性与性能优化更新

> 与 InteractableExfilsAPI 2.1.0 / LootingBots 1.6.2 / SAIN 4.4.0 协同优化批次。
> 审查报告: `docs/superpowers/reports/path-to-tarkov-optimization-report.md`
> 实施计划: `docs/superpowers/implementation-plan.md`

### 撤离路径健壮性

| ID | 描述 |
|---|---|
| EXFIX-1 | `CustomExfilService.ExtractTo` 增加 `PerformLocalGameStop` 封装 — 异常时 `DelayedAction` 延迟一帧重试，应对 LootingBots 等模组在 AI 清理时抛异常 |
| EXFIX-2 | `ExfilPrompt.CreateRunConfirm` 状态设置顺序修正 — 先清空委托、后执行动作、成功后置位 `_transitVoted`，防止异常导致 UI 卡死 |
| EXFIX-3 | `CustomExfilService.TransitTo` 增加 try-catch — `Transit.Create` 与 `vanillaTransitController.Transit` 失败时回退到 `PerformLocalGameStop` |

### 数据正确性

| ID | 描述 |
|---|---|
| DTFIX-1 | `LoadExfilSettings` MongoID 双重自增修正 — `foreach`+`Array.IndexOf+1`+`+1` 改为 `for` 循环直接 `locationId.Add(i + 1)` |

### 跨模组兼容

| ID | 描述 |
|---|---|
| CROSS-1 | `ExfilPromptService` 生命周期完善 — 字典赋值改 `Clear()`；新增 `Dispose()` 反注册事件；移除 IEAPI 默认 handler 前增加 null 检查 |
| CROSS-2 | `ExfiltrationPointAwakePatch` 类型识别改反射 — `component.GetType().FullName` 替代字符串比较 `"CustomExfilTrigger"`，失败回退字符串 |
| CROSS-3 | Fika `TransitVoteService` 投票生命周期 — `ForceAddValue` 改标准字典赋值；`GetMyPlayerNetId` 改 `int?`；`IsVoteSuccess` 清理离线玩家投票 |

### 性能优化

| ID | 描述 |
|---|---|
| PERF-1 | `ApplyExfilFiltering` O(n^2) -> O(n) — 内层 `allExfils.Any()` 替换为预构建 `HashSet<string>` O(1) 查找 |

### 统计

- **修改文件**: 5
- **新增文件**: 0
- **0 编译错误**
