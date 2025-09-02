---
title: "/animation"
contributors: ["BunnyNabbit \"Aon\""]
summary: "Provides a basic tool for exploiting a visual illusion of motion."
---

# /animation

Usage: `/animation [traversal direction]`

When invoked with the directions `next` or `previous`, the player is teleported away from their position to a different area called a "frame".

This command can only be called in a realm.

## Frames

Each frame is a 64x64x64 volume and are arranged and stacked in a way which creates 64 frames in a 256x256x256 realm volume. This is better visualized with the `/template animation` command which is a template of hollow rooms optimized for this command.

The frames which the player teleport to are ordered by XZY. If no more frames can be accessed, the last frame on the opposite traversal end will be used.
