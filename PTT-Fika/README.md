# Path To Tarkov - Fika Integration Module

This module provides Fika multiplayer compatibility for Path To Tarkov. It is automatically loaded when both Path To Tarkov and Fika are installed.

## Installation

The PTT-Fika.dll file should be placed in the `BepInEx/plugins/PathToTarkov/` directory. This is handled automatically by the Path To Tarkov installer.

## Features

- **Transit Voting System**: All players must vote for the same transit/extraction point before the group can leave
- **Synchronized Offraid Positions**: Each player maintains their own offraid position
- **Dedicated Server Support**: Full compatibility with Fika dedicated servers
- **Host Death Handling**: Transits are disabled if the host player dies

## Requirements

- Path To Tarkov 6.0.0 or higher
- Fika.Core 1.1.5 or higher
- All standard Path To Tarkov requirements

## How It Works

This module is loaded via reflection when Path To Tarkov detects that Fika is installed. It provides:

1. Network packet handling for transit voting
2. Synchronized extraction and transit operations
3. Player state management across the network
4. Dedicated server-specific transit logic

## Troubleshooting

If you experience issues with Fika integration:

1. Ensure both Path To Tarkov and Fika are up to date
2. Check that PTT-Fika.dll is in the correct directory
3. Verify no error messages in the BepInEx console
4. Report issues to the Path To Tarkov GitHub repository

## For Developers

This module demonstrates how to create optional Fika integration without making Fika a hard dependency. The pattern used here can be adapted for other mods that want to support both single-player and Fika multiplayer modes.