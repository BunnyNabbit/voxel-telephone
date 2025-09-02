---
title: "/template"
contributors: ["BunnyNabbit \"Aon\""]
summary: "Switches the level's template."
image: "./template-builder.webp"
imageAlt: "A space with a color palette arranged in a cube and axis lines pointing out from a corner."
---

# /template

Switches the level's template. For a list of templates, see `/help templates`.

Because of how Voxel Telephone stores block changes of a level, it may be possible that the level will look different after switching to another template.

Issues may become apparent if commands which read the level's state are used. `/template empty` may be useful for seeing how a level looks in the perspective of a describer.

Switching the template is a non-destructive action in terms of the block change timeline. Using this command does not affect how the level will look to a describer and will always be viewed with an empty template.
