---
title: "/vcr"
contributors: ["BunnyNabbit \"Aon\""]
summary: "The `/vcr` command enables VCR mode in a level."
---

# /vcr

Enables VCR mode in a level, allowing for previous level states to be viewed and switched to.

Block changes and commands are always saved and may be reverted if needed.

If VCR is enabled, the commands for rewinding (`/rewind <actions>`) and fast-forwarding (`/fastforward <actions>`) become usable. Rewinding and fast-forwarding only affects the preview and does not affect the level state until it has been committed with the `/commit` command.
