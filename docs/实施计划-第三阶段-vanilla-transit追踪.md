# Path To Tarkov 第三阶段实施计划：原版转移位置追踪

> 时间戳：2026-06-05 | 版本：v3.11.4
> 父议题：4 款自用预设审查中发现的原版转移位置丢失问题

---

## 1. 问题定义

### 现状

当 `enable_all_vanilla_transits: true` 时，玩家可以使用原版转移路线（如 Reserve D-2→Woods、Streets→Labs 等）。但原版转移绕过了 PTT 的位置追踪系统：

1. 原版转移事件被 `event-watcher.ts:302-306` 检测后直接返回，不调用 `updateOffraidPosition`
2. 玩家的 `offraidPosition` 停留在转移前的旧值
3. 导致：商人访问、仓库访问、回血机制全部基于错误的位置

### 目标

在原版转移到达新地图后，自动追踪并更新 `offraidPosition`，使商人/仓库/回血状态与新位置同步。

---

## 2. 技术方案

### 2.1 核心洞察

原版转移完成后，`syncLocationBase` 被调用时携带了**目标地图的 `ILocationBase`**：

```
syncLocationBase(locationBase: ILocationBase, sessionId: string)
                 ↑ locationBase.Id 就是目标地图内部 ID
```

同时，可通过 `this.db.getTables().locations[sourceMapName].base.transits` 获取源地图的转移定义数组。每个 `ITransit` 对象包含：

```typescript
interface ITransit {
  id: number;
  active: boolean;
  name: string;       // 转移点名称，如 "D-2"
  conditions: string;
  location: string;   // 目标地图内部 ID
  target: string;
  time: number;
}
```

通过比对 `transit.location` 和 `locationBase.Id`，可精确判断当前处理的 map 是否为转移目的地。

### 2.2 三层查找逻辑

```
目标地图确认后:
  第1层: 反向查 infiltrations     → 唯一匹配则直接使用
  第2层: 查 vanilla_transit_destination 配置映射  → 消歧义/兜底
  第3层: 放弃更新                → 保持当前位置（当前行为）
```

### 2.3 架构图

```
event-watcher.ts: endLocalRaid 回调
  │
  ├─ exitStatus = 'Transit' → 记录 raidCache
  │
  └─ originalEndLocalRaid → SPT 处理转移 → 新 raid 开始
       │
       ▼
createGenerateAll → syncLocationBase(locationBase, sessionId)
       │
       ├─ raidCache.exitStatus === 'Transit' ?
       │   │
       │   ├─ PTT transit (有 transitTargetMapName) → updateSpawnPointsForTransit
       │   │
       │   └─ Vanilla transit (无 transitTarget)
       │       │
       │       ├─ isTransitDestination(sourceMap, locationBase.Id) ?
       │       │   ├─ Yes: getVanillaTransitDestination(destinationMap, infiltrations, defaults)
       │       │   │   └─ 非 null → updateOffraidPosition(sessionId, destination)
       │       │   └─ No: skip (不是目标地图)
       │       │
       │       └─ updateInfiltrationForPlayerSpawnPoints (保持现有行为)
       │
       └─ updateSpawnPoints / updateLocationBaseExits / updateLocationBaseTransits
```

---

## 3. 代码改动

### 3.1 `src/config.ts` — 新增类型与导出

```
+ 导出 Infiltrations 类型（原为私有）
+ RawConfig / Config 新增 vanilla_transit_destination?: Record<string, string>
```

### 3.2 `src/config-analysis.ts` — 新增反向查找函数

```typescript
export const getVanillaTransitDestination = (
  destinationMap: string,
  infiltrations: Infiltrations,
  defaults?: Record<string, string>,
): string | null
```

逻辑：
1. 遍历 infiltrations，收集所有能到达 destinationMap 的 offraid 位置
2. 若候选唯一 → 直接返回
3. 查 defaults 映射 → 返回配置值
4. 放弃 → 返回 null

### 3.3 `src/path-to-tarkov-controller.ts` — 新增转移目的地验证 + 调用

```typescript
// 新增私有方法
private isTransitDestination(sourceMapName: string, destinationMap: string): boolean

// 修改 syncLocationBase 的 vanilla transit 分支 (~line 279-283)
// 添加目的地验证和位置更新逻辑
```

改动量估算：约 60 行新代码，0 行删除。

---

## 4. 测试计划

### 4.1 单元测试

- `getVanillaTransitDestination`：唯一候选/多候选+defaults/无候选+defaults/全无返回 null
- `isTransitDestination`：匹配/不匹配/源地图无 transits/数据库无数据

### 4.2 集成测试

- 从 Reserve 原版转移到 Woods → 验证 offraidPosition 更新
- 从 Streets 原版转移到 Labs → 验证（Labs 通常无 infiltration 定义，应跳过）
- 连续两次原版转移 → 验证每次都更新
- 原版转移后死亡（resetOnDeath:true）→ 验证重生位置优先

---

## 5. 风险与局限

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `vanilla_transit_destination` 映射未配置时，多候选无法消歧义 | LOW | 函数返回 null，保持当前行为 |
| SPT 版本升级后 `ITransit` 结构变化 | LOW | Typescript 编译时捕获 |
| `syncLocationBase` 在 generateAll 中被多次调用 | NONE | `isTransitDestination` 精确匹配目标地图，不会错误触发 |

### 已知局限

- **精确度上限**：反向 infiltrations 只能推导"你能去 Woods 的位置之一"，无法精确到"你从 D-2 去了 Secret_Pass"（需配置映射消歧义）
- **Labs 等无 infiltration 的地图**：原版转移到 Labs 后无法追踪位置（因为没有 offraid position 定义 Labs 的 infiltration）

---

## 6. 实施步骤

1. 修改 `config.ts` — 导出类型 + 新增配置字段
2. 修改 `config-analysis.ts` — 实现 `getVanillaTransitDestination`
3. 修改 `path-to-tarkov-controller.ts` — 实现 `isTransitDestination` + 修改 `syncLocationBase`
4. 运行测试套件验证无回归
5. 更新 `CHANGELOG.md`
