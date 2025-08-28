---
title: "/commit"
contributors: ["BunnyNabbit \"Aon\""]
summary: "The `/commit` command saves the current VCR state as the level state."
---

# /commit

Usable if VCR is currently enabled with `/vcr`.

Saves the state seen in VCR as the current level state and disables VCR mode, allowing for the level to be edited. Actions that were rewinded cannot be restored after a level state has been committed.

To cancel VCR without committing a state, use `/abort`.
