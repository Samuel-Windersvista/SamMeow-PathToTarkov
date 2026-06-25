# PathToTarkov 优化审查报告

> 生成时间：2026-06-23
> 审查范围：PTT-Plugin/Services/CustomExfilService.cs、PTT-Plugin/UI/ExfilPrompt.cs、PTT-Plugin/Services/ExfilPromptService.cs、PTT-Plugin/Patches/InitAllExfiltrationPointsPatch.cs、PTT-Plugin/Patches/ExfiltrationPointAwakePatch.cs、PTT-Fika/Services/TransitVoteService.cs

## 1. 概述

本次审查针对 PathToTarkov（PTT）与 InteractableExfilsAPI（IEAPI）、LootingBots 搭配使用时可能暴露的问题进行静态分析。重点关注撤离执行路径、提示状态机、撤离点过滤逻辑以及 Fika 投票模块的健壮性。

## 2. 发现的问题

### 2.1 `CustomExfilService.ExtractTo` 对 `LocalGame.Stop` 的异常保护不足

- **文件**：`PTT-Plugin/Services/CustomExfilService.cs`
- **行号**：原 `ExtractTo` 方法 50-52 行（已在本轮修复中增加 `PerformLocalGameStop` 封装）
- **风险等级**：高
- **描述**：`localGame.Stop(...)` 可能因其他模组（如 LootingBots）在 AI 清理阶段抛出异常而中断。异常会直接上抛，导致玩家看起来“撤离没反应”。
- **建议**：已实施一次延迟重试。可进一步增强为有限次重试 + 指数退避，并在重试前检查 `localGame`/`player` 状态是否仍有效。

### 2.2 `ExfilPrompt.CreateRunConfirm` 状态设置顺序存在异常时错误标记风险

- **文件**：`PTT-Plugin/UI/ExfilPrompt.cs`
- **行号**：28-39（已修复）
- **风险等级**：中
- **描述**：原代码先调用 `_actionToExecuteOnConfirm()`，再清空委托并设置 `_transitVoted = true`。若 `action()` 内部抛出异常，委托已被清空但 `_transitVoted` 未设置，UI 会卡在确认页。
- **建议**：已修复为先清空委托、再执行动作、成功后再设置 `_transitVoted`。

### 2.3 `CustomExfilService.TransitTo` 单机分支缺乏异常保护

- **文件**：`PTT-Plugin/Services/CustomExfilService.cs`
- **行号**：95-104
- **风险等级**：中
- **描述**：`vanillaTransitController.Transit(...)` 与 `Transit.Create(...)` 未做 try-catch。若转移控制器处于异常状态，可能导致 `ManualUpdate` 错误。
- **建议**：对 `Transit.Create` 与 `Transit(...)` 调用增加 null 检查与 try-catch，失败时通知玩家并回退状态。

### 2.4 `ExfilPromptService` 事件订阅缺乏反注册与字典清理方式

- **文件**：`PTT-Plugin/Services/ExfilPromptService.cs`
- **行号**：12-37
- **风险等级**：中
- **描述**：
  - `IndexedExfilPrompts = []` 会替换字典引用，若外部持有旧引用会失效。
  - 使用 `ieService.OnActionsAppliedEvent -= ieService.ApplyExtractToggleAction` 移除 IEAPI 默认 handler，若 IEAPI 版本变化可能导致 no-op。
  - 未在 raid 结束或插件卸载时反注册自身 handler。
- **建议**：
  - 使用 `IndexedExfilPrompts.Clear()` 而非重新赋值。
  - 提供 `Dispose()` 或 `OnRaidEnded()` 方法反注册事件。
  - 在移除默认 handler 前用反射确认方法存在。

### 2.5 `InitAllExfiltrationPointsPatch` 中 `LoadExfilSettings` 的 MongoID 计算存在 off-by-one 风险

- **文件**：`PTT-Plugin/Patches/InitAllExfiltrationPointsPatch.cs`
- **行号**：207-219
- **风险等级**：高
- **描述**：当前代码为：
  ```csharp
  int num = Array.IndexOf(allExfils, exfiltrationPoint) + 1;
  MongoID mongoID = locationId.Add(num + 1);
  ```
  对 index 做了两次 +1，可能生成与 EFT 原生逻辑不一致的 ID，影响撤离点设置加载。
- **建议**：使用 `for` 循环直接通过索引 `i` 计算 `locationId.Add(i + 1)`，并添加注释说明与原生逻辑的对齐方式。

### 2.6 `InitAllExfiltrationPointsPatch.ApplyExfilFiltering` 使用 Settings.Name 字符串匹配

- **文件**：`PTT-Plugin/Patches/InitAllExfiltrationPointsPatch.cs`
- **行号**：79-116
- **风险等级**：中
- **描述**：使用 `allExfils.Any(e => e.Settings.Name == exfil.Settings.Name)` 判断保留，时间复杂度为 O(n^2)，且撤离点名称冲突时可能误判。
- **建议**：使用 `HashSet<string>` 收集保留名称，或比较实例引用。

### 2.7 `ExfiltrationPointAwakePatch` 通过字符串名称识别 `CustomExfilTrigger`

- **文件**：`PTT-Plugin/Patches/ExfiltrationPointAwakePatch.cs`
- **行号**：66-75
- **风险等级**：中
- **描述**：`component.GetType().Name == "CustomExfilTrigger"` 字符串比较脆弱，IEAPI 类型若重命名会失效。
- **建议**：通过反射加载 `InteractableExfilsAPI` 程序集并获取实际类型后比较，或使用 `component.GetType().FullName`。

### 2.8 `ExfiltrationPointAwakePatch.GetTargetMethod` 反射失败时可能返回 null

- **文件**：`PTT-Plugin/Patches/ExfiltrationPointAwakePatch.cs`
- **行号**：16-33
- **风险等级**：低
- **描述**：若 `ExfiltrationPoint.Awake` 方法无法找到，会返回 null。取决于 SPT Reflection 的实现，可能导致补丁注册异常或静默失败。
- **建议**：在 method 为 null 时抛出明确异常，记录 ERROR 级别日志。

### 2.9 `TransitVoteService` 使用未在仓库内定义的 `ForceAddValue`

- **文件**：`PTT-Fika/Services/TransitVoteService.cs`
- **行号**：75、86、237、247
- **风险等级**：中
- **描述**：`Votes.ForceAddValue(...)` 为扩展方法，但仓库内未找到定义。若依赖项缺失会导致编译/运行时错误。
- **建议**：使用标准字典赋值 `Votes[netId] = exfilTarget;`，并封装为辅助方法。

### 2.10 `TransitVoteService.GetMyPlayerNetId` 默认返回 0

- **文件**：`PTT-Fika/Services/TransitVoteService.cs`
- **行号**：500-509
- **风险等级**：低
- **描述**：当 `CoopHandler.MyPlayer` 不存在时返回 0，可能与合法玩家 ID 冲突。
- **建议**：返回 nullable int 或 -1 作为错误占位，并在发送包前校验。

### 2.11 `TransitVoteService.IsVoteSuccess` 未清理离线/离开玩家投票

- **文件**：`PTT-Fika/Services/TransitVoteService.cs`
- **行号**：403-449
- **风险等级**：中
- **描述**：`Votes` 字典不会随玩家加入/离开事件更新，断线玩家留下的投票会导致投票永远无法成功。
- **建议**：在玩家离开事件或投票检查前，清理 `Votes` 中不存在于当前 `humanPlayers` 列表的键。

## 3. 已修复项

- `CustomExfilService.ExtractTo` 已增加 `PerformLocalGameStop` 封装，支持一次延迟重试。
- `ExfilPrompt.CreateRunConfirm` 已调整状态设置顺序，避免异常导致状态不一致。

## 4. 跨模组兼容性建议

### 4.1 与 InteractableExfilsAPI

- PTT 移除 IEAPI 默认 `ApplyExtractToggleAction` 并替换为自定义 handler，建议通过版本检测与反射确认 handler 存在。
- 禁用撤离点时销毁 `CustomExfilTrigger` 应使用类型比较而非字符串比较。

### 4.2 与 LootingBots

- `LocalGame.Stop` 调用链中，LootingBots 的 `RemoveLootingBrainPatch` 可能因 `BotOwner.GetPlayer` 为空而抛异常。PTT 已增加 try-catch + 重试，但建议 LootingBots 侧也修复空值检查。
- 建议增加更详细的日志记录异常来源，便于定位冲突模组。

## 5. 优先级建议

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P1 | `LoadExfilSettings` MongoID 计算 | 高风险，影响撤离点设置正确性 |
| P2 | `ExtractTo` 异常保护 | 已部分修复，可进一步增强为重试+退避 |
| P3 | `ExfilPromptService` 事件反注册与字典清理 | 避免跨战局副作用 |
| P4 | `TransitTo` 异常保护 | 转移路径同样需要健壮性 |
| P5 | `TransitVoteService` 投票生命周期管理 | 多人模式稳定性 |

## 6. 验证建议

1. 本地单人战局测试普通撤离与转移，观察 `LogOutput.log` 是否出现 `localGame.Stop failed` 重试日志。
2. 检查撤离后 `LocalRaidEndedPatch` 是否正确覆盖 `exitName`。
3. Fika 多人模式下测试投票、断线、主机死亡等边界场景。
