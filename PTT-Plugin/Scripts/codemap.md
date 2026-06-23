# Scripts - Codemap

## Responsibility
Unity `MonoBehaviour` scripts that are attached at runtime to modify or fix UI behavior. Currently contains one compatibility script.

## File-by-File Design

### KaenoTraderScrollingCompatScript.cs
- **Public** `MonoBehaviour` in namespace `PTT.Scripts`.
- Purpose: Compensates for the KaenoTraderScrolling mod, which adds a scrollbar to the trader cards panel. When more than 10 trader cards are present, the default anchor causes the scrollbar to clip off-screen. This script dynamically shifts `anchorMin.x` leftward to make room.
- **Awake()**: Finds the `TraderCards` GameObject, gets its `RectTransform`, counts active children, and calls `RecomputeAnchorMin()`.
- **FixedUpdate()**: Polls the active child count every physics frame. If it changes, recalculates the anchor offset.
- **RecomputeAnchorMin()**:
  - Base anchor: `(0.595f, 1f)` -- works for 10 or fewer cards.
  - For each card beyond 10: subtracts `0.065f` from the X value per extra card.
  - Formula: `anchorMin.x = 0.595f - (count - 10) * 0.065f`
- No dependencies on other PTT assemblies.

## Flow
- Instantiated and attached to a GameObject at plugin startup (in the plugin main class).
- `Awake` -> initial anchor computation -> `FixedUpdate` polls for card count changes -> recompute on delta.

## Integration
- Attached dynamically by the plugin core; not part of any Unity prefab or scene.
- Reads the `TraderCards` UI element that is part of the vanilla EFT trader screen (modified by Kaeno's mod).
- Has no coupling to other PTT modules.
