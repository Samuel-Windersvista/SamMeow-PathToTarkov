# PTT 防御性重试补丁实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 PathToTarkov 的撤离执行路径上增加防御性 try-catch + 延迟重试，避免其他模组在 `LocalGame.Stop` 中抛出异常导致撤离无响应。

**Architecture:** 修改 `CustomExfilService.ExtractTo` 与 `TransitTo`（单机分支），将 `Stop`/`Transit` 调用包入 try-catch；异常时使用现有的 `DelayedAction` 组件在下一帧重试一次。同时修复 `ExfilPrompt.CreateRunConfirm` 中状态设置顺序，使异常不会错误地把提示状态标记为已完成。

**Tech Stack:** C# / BepInEx / SPT 3.11.4 / Unity

---

## Task 1: 为 CustomExfilService.ExtractTo 增加 try-catch + 延迟重试

**Files:**
- Modify: `PTT-Plugin/Services/CustomExfilService.cs:17-53`

- [ ] **Step 1: 修改 `ExtractTo` 单机分支，增加异常捕获与重试**

```csharp
public static void ExtractTo(ExfiltrationPoint exfil, ExfilTarget exfilTarget)
{
    // For now, Fika extraction is handled the same as transit
    // The Fika module will handle the actual extraction logic
    if (Plugin.FikaIsInstalled)
    {
        FikaBridge.TransitTo(exfilTarget);
        return;
    }

    LocalGame localGame = Singleton<AbstractGame>.Instance as LocalGame;
    Player player = Singleton<GameWorld>.Instance.MainPlayer;
    Logger.Info($"started extraction on '{exfilTarget.GetCustomExitName()}'");


    if (localGame == null)
    {
        Logger.Error($"cannot extract because no LocalGame found");
        return;
    }

    if (player == null)
    {
        Logger.Error($"cannot extract because no Player found");
        return;
    }

    CurrentExfilTargetService.SaveExfil(exfilTarget);

    // This is needed to validate extract quests like `Burning Rubber`
    // The ptt custom ptt exfil target name will be used to override the exitName in the LocalRaidEndedPatch
    string exitName = exfilTarget.exitName;

    float delay = 0f;
    PerformLocalGameStop(localGame, player.ProfileId, exitName, delay);
}

private static void PerformLocalGameStop(LocalGame localGame, string profileId, string exitName, float delay)
{
    try
    {
        localGame.Stop(profileId, ExitStatus.Survived, exitName, delay);
        Logger.Info($"local game stopped for profile '{profileId}'");
    }
    catch (Exception ex)
    {
        Logger.Error($"localGame.Stop failed: {ex.Message}");
        Logger.Error($"Stack trace: {ex.StackTrace}");
        Logger.Info($"scheduling delayed retry for localGame.Stop");

        var delayedActionGO = new GameObject("PTT_ExtractRetry");
        delayedActionGO.AddComponent<DelayedAction>().Init(() =>
        {
            try
            {
                localGame.Stop(profileId, ExitStatus.Survived, exitName, delay);
                Logger.Info($"local game stopped for profile '{profileId}' on retry");
            }
            catch (Exception retryEx)
            {
                Logger.Error($"localGame.Stop retry failed: {retryEx.Message}");
                NotificationManagerClass.DisplayWarningNotification(
                    "Extraction failed, please try again.",
                    ENotificationDurationType.Long);
            }
        });
    }
}
```

- [ ] **Step 2: 编译 PTT 客户端项目，确认无语法错误**

Run: `dotnet build PTT-Plugin/PTT-Plugin.csproj -c Release`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add PTT-Plugin/Services/CustomExfilService.cs
git commit -m "fix: wrap localGame.Stop in try-catch with delayed retry"
```

---

## Task 2: 修复 ExfilPrompt.CreateRunConfirm 的状态设置顺序

**Files:**
- Modify: `PTT-Plugin/UI/ExfilPrompt.cs:28-39`

- [ ] **Step 1: 调整确认回调执行顺序，避免异常导致状态错误**

```csharp
private Action CreateRunConfirm()
{
    return () =>
    {
        if (_actionToExecuteOnConfirm != null)
        {
            var action = _actionToExecuteOnConfirm;
            _actionToExecuteOnConfirm = null;
            action();
            _transitVoted = true;
        }
    };
}
```

- [ ] **Step 2: 编译 PTT 客户端项目，确认无语法错误**

Run: `dotnet build PTT-Plugin/PTT-Plugin.csproj -c Release`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add PTT-Plugin/UI/ExfilPrompt.cs
git commit -m "fix: set transitVoted only after exfil action succeeds"
```

---

## Task 3: （可选）为 TransitTo 单机分支增加同样保护

**Files:**
- Modify: `PTT-Plugin/Services/CustomExfilService.cs:55-105`

- [ ] **Step 1: 在 `TransitTo` 的非 Fika 分支中，对 `vanillaTransitController.Transit(...)` 增加 try-catch + 延迟重试**

如果当前只处理普通撤离失败问题，可以跳过此任务。若希望统一保护撤离/转移两条路径，请参照 Task 1 对 `vanillaTransitController.Transit(transit, playersCount, transitHash, profiles, player);` 调用进行同样包装。

---

## Self-Review

- **Spec coverage:** 用户要求“给 PTT 增加防御性重试补丁”。Task 1 覆盖普通撤离；Task 2 修复状态机；Task 3 可选覆盖转移。
- **Placeholder scan:** 无 TBD/TODO，所有代码块完整。
- **Type consistency:** `LocalGame`、`ExitStatus`、`NotificationManagerClass`、`ENotificationDurationType` 均已在原项目中使用。

**Plan complete.**
