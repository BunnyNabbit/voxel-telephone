---
title: "/CourierTransform"
contributors: ["BunnyNabbit \"Aon\""]
summary: "Simulates the result of rough handling during transit."
image: "./couriertransform-result.webp"
imageAlt: "A damaged cardboard box."
---

# /CourierTransform

Transforms a selection of blocks in a way which looks like it was damaged during transit.

![A damaged cardboard box.](./couriertransform-result.webp)

Aliases: `/courier`

## Behavior

Several steps are taken to simulate the result of roughly handling an object during transit.

### Destroying and gravity

This step is first taken. Blocks within the selection have a chance to be damaged. When a block is damaged, it either falls to the lowest voxel available or get replaced by the held block.

A block is only affected by gravity for 32 blocks. If a falling block cannot find a suitable block to land on, it may float.

### Imploding

This step is taken last. From each of the 8 corners, blocks have a chance to be brought closer to the selection's center.
