# PTT.UI

## Files

### ExfilPrompt.cs

**Responsibility**

Generates the UI model (action list) for the custom interaction wheel/prompt that appears when a player stands inside an exfiltration zone. It replaces the vanilla "Hold F to extract" with a multi-step menu: pick a destination (extract or transit), then confirm or cancel. Each distinct exfiltration point on the map gets its own `ExfilPrompt` instance, cached by `ExfilPromptService`.

**Design**

- **Primary constructor:** `ExfilPrompt(ExfiltrationPoint Exfil)` -- bound to one concrete exfil point.
- **State machine** via three private fields:
  - `_exfiltrated` (bool) -- set true once the player has extracted or transited; `Render()` returns `null` while true.
  - `_transitVoted` (bool) -- set true once the player confirms a transit vote (only used for multi-player/Fika).
  - `_actionToExecuteOnConfirm` (Action) -- the actual side-effect (extract or transit) that fires when the player picks "confirm" from the confirmation sub-menu. Cleared after execution.
  - `_selectedTransitExfilTarget` (ExfilTarget) -- remembered so the prompt can auto-cancel if the transit destination becomes disabled while the player is still choosing.
- **Central method:** `Render() -> OnActionsAppliedResult` -- called every frame by the IEAPI event pipeline. Returns `null` unless there are available targets and the player hasn't already exfiltrated.
- **Three-step workflow inside `Render()`:**
  1. **Action selection** (line 136-143): Build a `List<CustomExfilAction>` from all available `ExfilTarget`s. Each action's `onSelected` callback stores the real side-effect in `_actionToExecuteOnConfirm` and advances to step 2.
  2. **Confirmation** (line 156-165): Present a two-action menu (confirm/cancel). Confirm calls `CreateRunConfirm()` which executes the stored `_actionToExecuteOnConfirm`.
  3. **Cancellation** (line 168): After confirmation, only a "Cancel" action remains (allows the vote to be retracted in Fika).
- **Auto-cancel guard** (line 148-153): If transit becomes disabled (e.g. another Fika player's vote changed the destination), the vote is silently cancelled and the prompt resets back to step 1.
- Called by the IEAPI's `OnActionsAppliedEvent` via `ExfilPromptService` -> `InteractableExfilsService`.

**Flow**

```
Player enters exfil zone
  -> InteractableExfilsService fires OnActionsAppliedEvent
    -> ExfilPromptService.ExfilPromptHandler()
      -> ExfilPrompt.Render() [first render: InitPromptState()]
        -> actionSelection phase
          -> CreateCustomExfilAction for each ExfilTarget (extract or transit)
            -> onSelected sets _actionToExecuteOnConfirm, plays MenuEnter sound
          -> return OnActionsAppliedResult(actions, OnExitZone)
        -> Player picks an action
          -> next Render(): confirmation phase (confirm + cancel)
            -> confirm -> _actionToExecuteOnConfirm() -> CustomExfilService.ExtractTo() or TransitTo()
            -> cancel -> CreateRunCancel() -> CancelVote + InitPromptState + MenuCancel sound
          -> if transit disabled mid-menu: auto-cancel back to actionSelection
  -> OnExitZone() fires when player leaves zone
    -> InitPromptState() + CancelVote if _transitVoted
```

**Integration**

- **Input:** `ExfiltrationPoint` (EFT.Interactive), `List<ExfilTarget>` from `Plugin.CurrentLocationDataService.GetExfilTargets(Exfil)`
- **Output:** `OnActionsAppliedResult` (from InteractableExfilsAPI) -- fed back into the IEAPI interaction wheel rendering.
- **Caching:** `ExfilPromptService` holds a `Dictionary<string, ExfilPrompt>` keyed by exfil `Settings.Name`. Cleared on raid start / game restart.
- **Sound feedback:** `Sound.PlayMenuEnter()`, `Sound.PlayMenuCancel()`, `Sound.PlayExtractConfirm()`, `Sound.PlayTransitConfirm()` -- all via `GUISounds`.
- **Action execution side-effects:**
  - `CustomExfilService.ExtractTo(exfil, exfilTarget)` -- calls `LocalGame.Stop()` with `ExitStatus.Survived`.
  - `CustomExfilService.TransitTo(exfilTarget, onDone)` -- calls `TransitControllerAbstractClass.Transit()`; on Fika it uses `FikaBridge.VoteForExfil` then `FikaBridge.TransitTo`.
  - `CustomExfilService.CancelTransitVote(message)` -- delegates to `FikaBridge.CancelVoteForExfil` on Fika, no-op otherwise.

---

### ExfilTooltip.cs

**Responsibility**

Generates the rich-text tooltip text shown in the HUD extraction timer panel (`ExitTimerPanel`). It replaces the vanilla extraction point name and status label with PathToTarkov's offraid-position-aware text, including colored lists of reachable maps and traders for each exfil point.

**Design**

- **Primary constructor:** `ExfilTooltip(ExfiltrationPoint ExfilPoint)` -- bound to one exfil point.
- **Three public methods:**
  1. `GetPrimaryText()` -- returns the localized exfil point name.
     - Retrieves the current `locationId` from `GameWorld` singleton.
     - Looks up a locale key of the form `PTT_EXTRACT_{locationId}.{exfilSettingsName}` and wraps it in a `<width=100%><align=\"left\">` rich-text tag.
  2. `GetSecondaryText()` -- returns the multi-line tooltip body.
     - Builds a list of lines:
       1. **maps line** (green): `"Maps: <color=green>MapA</color>, <color=green>MapB</color>"` -- only shown if there are any `nextMaps` across all `ExfilTarget`s for this exfil.
       2. **traders line** (orange): `"Traders: <color=orange>TraderX</color>, <color=orange>TraderY</color>"` -- only shown if there are any `nextTraders`.
     - Each line uses `PREFIX_LAYOUT_MAPS` / `PREFIX_LAYOUT_TRADERS` (`<width=100%><align=\"left\"><size=40%>`) for two-column layout alignment.
     - Uses plural-aware locale keys: "MAP" (singular) or the locale item `5b47574386f77428ca22b343` (plural, Tarkov's default "Maps" key) via `GetMapsWord()`. Similarly "Merchant" / "MERCHANTS" for traders.
  3. `GetRequirementsTexts()` -- placeholder, returns empty array.

- **Private helpers:**
  - `GetLocalizedTraders()` -- collects all unique `traderId` values from `ExfilTarget.nextTraders` across all targets for this exfil, then localizes each via `"{traderId} Nickname".Localized()`.
  - `GetLocalizedMaps()` -- collects all unique `mapId` values from `ExfilTarget.nextMaps`, localizing each.

**Flow**

```
ExitTimerPanel.UpdateVisitedStatus postfix (ExitTimerPanelPatch)
  -> new ExfilTooltip(exfilPoint)
  -> pointName.text = GetPrimaryText()
  -> pointStatusLabel.text = GetSecondaryText()
  -> itemsToBringLabel.text = GetRequirementsTexts() (if non-empty)
```

**Integration**

- **Input:** `ExfiltrationPoint` (EFT.Interactive), `ExfilTarget` data from `Plugin.CurrentLocationDataService.GetExfilTargets(ExfilPoint)`
- **Output:** Rich-text `string` values assigned to `TextMeshProUGUI` fields on the `ExitTimerPanel` prefab.
- **Consumed by:** `ExitTimerPanelUpdateVisitedStatusPatch` (postfix patch on `ExitTimerPanel.UpdateVisitedStatus()`), which runs every frame the extraction timer panel updates.
- **Localization:** Uses EFT's `.Localized()` extension method. Keys are dynamically constructed from `locationId` + exfil name for primary text, and from Bsg locale keys for maps/traders.
- **Layout:** Uses Unity rich-text tags (`<width>`, `<align>`, `<size>`, `<color>`) to format within the TMP text boundaries. All tooltip content is left-aligned.
