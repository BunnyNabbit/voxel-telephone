---
title: "/PositionalTransform"
contributors: [ "BunnyNabbit \"Aon\"" ]
summary: "Transforms a selection. It can be used for moving, copying, flipping or spinning a selection of blocks."
image: "./positionaltransform-mirrored-dragons.webp"
imageAlt: "A black dragon with cyan eyes and white underbelly is being mirrored horizontally by his hand. The dragon is in a bipedal form and has one hand lifted closer to the center than the other."
---

# /PositionalTransform

Transforms a selection of blocks. It can be used for moving, copying, flipping or spinning a selection of blocks. It can be used for moving, copying, flipping or spinning a selection of blocks.

Command layout: `/positionaltransform &enum:mode &enum:rotation &enum:flipAxis position:positionStart position:positionEnd position:offsetPosition position:pastePosition`

Aliases: `/move`

## Modes

The `&enum:mode` parameter is used as the base mode. It is `move` by default,

- `move` Moves the selection by clearing the selection with air.
- `copy` Preserves the original selection.
- `moveAir` Same as `move` but pastes air blocks over pasting area.
- `copyAir` Same as `copy` but pastes air blocks over pasting area.

## Spinning

A selection can be spun clockwise or counterclockwise using the `&enum:rotation` parameter.

- `none` No rotation transformation applied.
- `clockwise`
- `counterclockwise`

Example: `/positionaltransform move clockwise`. Spins the selection clockwise.

![Two clocks are arranged side-by-side. The clock on the left has its red hand pointing to the right and the clock on the right is pointing down.](./positionaltransform-clocks.webp)

## Flipping

Example: `/positionaltransform copy none x`. Copies and flips a selection by its X axis.

![A black dragon with cyan eyes and white underbelly is being mirrored horizontally by his hand. The dragon is in a bipedal form and has one hand lifted closer to the center than the other.](./positionaltransform-mirrored-dragons.webp)

- `none` No flip transformation applied.
- `x` Flip by x axis.
- `y` Flip by y axis.
- `z` Flip by z axis.
