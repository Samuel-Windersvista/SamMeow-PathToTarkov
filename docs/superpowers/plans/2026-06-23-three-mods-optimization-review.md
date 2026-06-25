# 三模组优化审查计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 PathToTarkov、InteractableExfilsAPI、LootingBots 三个模组进行静态代码审查，识别可优化点，形成报告分别放到各自根目录的 `docs/superpowers/reports/` 下。

**Architecture:** 分别阅读三个仓库的核心源码，从以下维度评估：异常安全、资源管理、状态机正确性、性能、可维护性、跨模组兼容性。每条建议给出文件位置、问题描述、风险等级与推荐修改方向。

**Tech Stack:** C# / TypeScript / BepInEx / SPT 3.11.4 / Unity

---

## Task 1: 审查 PathToTarkov

**Files:** 重点关注 `PTT-Plugin/Services/CustomExfilService.cs`、`PTT-Plugin/UI/ExfilPrompt.cs`、`PTT-Plugin/Services/ExfilPromptService.cs`、`PTT-Plugin/Patches/InitAllExfiltrationPointsPatch.cs`、`PTT-Plugin/Patches/ExfiltrationPointAwakePatch.cs`、`PTT-Fika/Services/TransitVoteService.cs`。

- [ ] **Step 1: 阅读上述文件并记录潜在问题**

关注：
- `localGame.Stop` / `vanillaTransitController.Transit` 是否做异常保护
- `ExfilPrompt` 两步状态机在边界条件下是否正确
- 撤离点过滤/禁用逻辑是否会与 IEAPI 创建的触发器冲突
- Fika 桥接中撤离/转移事件签名是否完整
- 缓存/静态字段在战局间是否正确清理

- [ ] **Step 2: 编写 `docs/superpowers/reports/path-to-tarkov-optimization-report.md`**

报告结构：
```markdown
# PathToTarkov 优化审查报告

## 1. 概述
## 2. 发现的问题
### 2.1 [问题标题]
- 文件：`PTT-Plugin/...`
- 风险等级：高/中/低
- 描述：...
- 建议：...
## 3. 优先级建议
## 4. 附录：已修复项
```

---

## Task 2: 审查 InteractableExfilsAPI

**Files:** 重点关注 `Patches/GetAvailableActionsPatch.cs`、`Components/CustomExfilTrigger.cs`、`Singletons/InteractableExfilsService.cs`、`Components/InteractableExfilsSession.cs`。

- [ ] **Step 1: 阅读上述文件并记录潜在问题**

关注：
- `GetAvailableActionsPatch` 每次调用都新建 `GameObject` 是否必要
- `CustomExfilTrigger.OnTriggerExit` 清空 `AvailableInteractionState` 是否会导致下游状态丢失
- `WrapCustomExfilAction` 中 `RefreshPrompt` 在回调内部是否安全
- `IsFirstRender` 的实现是否足够鲁棒
- `InteractableExfilsSession` 生命周期中触发器清理是否完整

- [ ] **Step 2: 编写 `docs/superpowers/reports/interactable-exfils-api-optimization-report.md`**

---

## Task 3: 审查 LootingBots

**Files:** 重点关注 `Patches/RemoveLootingBrainPatch.cs`、`Components/LootingBrain.cs`、`Utilities/LootCache.cs`、`Utilities/ActiveBotCache.cs`。

- [ ] **Step 1: 阅读上述文件并记录潜在问题**

关注：
- `RemoveLootingBrainPatch.PatchPrefix` 空值检查是否充分
- `ActiveBotCache` 使用 List 而非 Dictionary/HashSet 的性能影响
- `ActiveLootCache` 清理逻辑在并发或异常路径下是否安全
- 其他 Patch 是否也有类似的 `GetPlayer` 空引用风险

- [ ] **Step 2: 编写 `docs/superpowers/reports/looting-bots-optimization-report.md`**

---

## Task 4: 汇总与交叉检查

- [ ] **Step 1: 检查三份报告是否覆盖以下跨模组问题**

- PTT 与 IEAPI 的事件订阅顺序是否可预测
- PTT 禁用撤离点时是否通知 IEAPI 清理触发器
- LootingBots 与 PTT 在 `LocalGame.Stop` 中的异常交互

- [ ] **Step 2: 验证报告文件路径**

确保文件存在于：
- `SamMeow-PathToTarkov/docs/superpowers/reports/path-to-tarkov-optimization-report.md`
- `SamMeow-InteractableExfilsAPI/docs/superpowers/reports/interactable-exfils-api-optimization-report.md`
- `Moew-LootingBot-For-3114/docs/superpowers/reports/looting-bots-optimization-report.md`

---

## Self-Review

- **Spec coverage:** 用户要求“检查三个 mod 有没有值得优化的地方，形成报告分别放到各自根目录的 docs/ 里”。本计划覆盖三个仓库，输出三份报告。
- **Placeholder scan:** 无 TBD/TODO。
- **Type consistency:** 报告为 Markdown，无代码类型一致性问题。

**Plan complete.**
