# PTT-Packets/

## Responsibility

Shared network packet library for PathToTarkov's multiplayer synchronization layer. Defines all wire-format packet types that flow between PTT-Plugin and PTT-Fika over LiteNetLib. This project has zero runtime logic -- it exists solely as a binary-contract library so both sides serialize/deserialize identically.

## Design

- **Target Framework**: .NET Framework 4.71 (`net471`), matching SPT's runtime.
- **Assembly Name**: `Trap.PathToTarkov-Packets.dll`
- **Serialization Backend**: All packets implement `LiteNetLib.Utils.INetSerializable`, providing binary `Serialize`/`Deserialize` methods. No JSON or text encoding is used on the wire.
- **Null-Safe Strings**: `RawExfilTarget` uses an `EnsureNull()` helper because LiteNetLib's `GetString()`/`Put()` do not natively roundtrip `null`. Empty strings on the wire are converted back to `null` for game code that expects nullable strings.
- **Namespace**: `PTT.Packets` -- deliberately short to keep wire-type names readable in logs and debugging.
- **Signal vs. Data Packets**: Some packets carry payload (`PlayerVotedForExfilTargetPacket`, `DisableTransitVotePacket`, `RawExfilTarget`), while `PerformExfilPacket` is a zero-payload signal (empty serialize/deserialize) -- a pure command over the wire.

## Flow

```
PTT-Plugin (game client)
    |
    | Creates packet struct, populates fields
    | Serializes via INetSerializable.Serialize(NetDataWriter)
    v
LiteNetLib (via Fika.Core) --- reliable ordered channel ---> LiteNetLib
    |
    | Deserializes via INetSerializable.Deserialize(NetDataReader)
    v
PTT-Fika (networking host / server-side)
```

No packet routing, queuing, or sequencing logic lives here. This project only defines the shape. The consumers (PTT-Plugin, PTT-Fika) decide when to send and how to react.

## Integration

| Consumer  | Purpose                                                    |
|-----------|------------------------------------------------------------|
| PTT-Plugin | BepInEx plugin running inside EFT. Sends/receives packets for the local player. |
| PTT-Fika   | Fika-compatible networking layer. Relays/aggregates packets across peers. |

**Upstream dependencies** (all referenced via `.csproj` `HintPath`):
- `spt-common.dll` / `spt-reflection.dll` -- SPT base APIs
- `Assembly-CSharp.dll` -- EFT game types (e.g. `ExitName` matches in-game exfil enum strings)
- `Fika.Core.dll` -- provides the LiteNetLib networking pipeline and peer management
- `BepInEx` -- plugin host
- `UnityEngine.*`, `Sirenix.Serialization`, `Newtonsoft.Json` -- transitive game dependencies

**Non-dependency**: This project does NOT reference `PTT-Plugin` or `PTT-Fika`. It is a leaf node in the dependency graph, consumed by both.
