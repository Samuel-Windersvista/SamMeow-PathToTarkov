# PTT-Packets/Packets/

## Responsibility

Concrete packet type definitions for the PathToTarkov exfiltration voting system. Each file defines one `INetSerializable` struct that represents a single message type on the wire.

---

## Packet Index

| File                                    | Struct                          | Payload | Direction         |
|-----------------------------------------|----------------------------------|---------|-------------------|
| `RawExfilTarget.cs`                     | `RawExfilTarget`                 | 5 fields| Embedded in vote  |
| `PlayerVotedForExfilTargetPacket.cs`    | `PlayerVotedForExfilTargetPacket`| 2 fields| Client -> Host    |
| `PerformExfilPacket.cs`                 | `PerformExfilPacket`             | None    | Host -> All       |
| `DisableTransitVotePacket.cs`           | `DisableTransitVotePacket`       | 1 field | Host -> All       |

---

## Design

- **All structs**: Packets are `struct`, not `class`, to avoid heap allocation per-message in the networking hot path.
- **Single-file-per-type**: Each packet gets its own file. No shared base class -- each struct independently implements `INetSerializable`.
- **Manual serialization**: No codegen or attributes. `Serialize`/`Deserialize` are handwritten, giving explicit control over wire format and backward compatibility.

---

## Packet Details

### `RawExfilTarget`

Lowest-level exfil target reference. Not sent alone on the wire -- embedded inside `PlayerVotedForExfilTargetPacket`.

```
Wire format:
  ExitName         (string)   -- exfil point name, empty string = player leaving a zone
  IsTransit        (bool)     -- true if this is a map-transit exfil
  TransitMapId     (string)   -- target map ID (transit only, empty otherwise)
  TransitSpawnPointId (string)-- target spawn point (transit only, empty otherwise)
  OffraidPosition  (string)   -- position for off-raid extraction (empty for transit)
```

**Null roundtrip quirk**: `Serialize` writes `""` for null fields; `Deserialize` converts `""` back to `null` via `EnsureNull()`. This works around LiteNetLib's lack of nullable string support.

**`EnsureNull(string val)`** -- private helper; returns `null` if `val == ""`, else `val`.

---

### `PlayerVotedForExfilTargetPacket`

Carries a single player's vote on where the squad should extract.

```
Wire format:
  NetId           (int)             -- player's network ID (from Fika peer list)
  RawExfilTarget  (RawExfilTarget)  -- the target they voted for
```

**`IsVoteCancelled()`**: Returns `true` when `ExitName` is null or empty, meaning the player withdrew their vote (e.g. deselected the exfil point in the UI).

---

### `PerformExfilPacket`

A zero-payload command packet. Both `Serialize` and `Deserialize` are empty. Acts as a trigger: when received, the client executes the exfiltration that has already been agreed upon via the voting packets.

---

### `DisableTransitVotePacket`

Sent by the host to notify all clients that transit-map voting is unavailable for this raid.

```
Wire format:
  Reason  (string)   -- human-readable or enum-reason string ("TooFewPlayers", "MapNotSupported", etc.)
```

---

## Flow (Exfil Voting Protocol)

```
1. INIT: Host sends DisableTransitVotePacket (Reason) if transit voting is unavailable.
        Otherwise, voting period begins.

2. VOTE: Each client sends PlayerVotedForExfilTargetPacket(NetId, RawExfilTarget)
         whenever the local player selects or deselects an exfil point.
         Deselect = IsVoteCancelled() == true (ExitName null/empty).

3. RESOLVE: Host tallies votes. When consensus/decision is reached,
            host broadcasts PerformExfilPacket (empty signal).

4. EXECUTE: Each client, on receiving PerformExfilPacket, runs the agreed exfiltration
            for the local player.
```

---

## Integration

- All types live in namespace `PTT.Packets`.
- Consumers reference this assembly and use the structs directly: instantiate, populate, send via `NetDataWriter.Put<T>()`.
- No events, callbacks, or message handlers are defined here. The consumer project implements the switch logic when deserialized packets arrive.
- The packet set is purpose-built for the PTT exfil voting feature and is not a general-purpose network message library.
