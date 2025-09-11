---
title: "/animation"
contributors: [ "BunnyNabbit \"Aon\"" ]
summary: "Proporciona una herramienta básica para explotar una ilusión visual del movimiento."
---

# /animation

Uso: `/animation [dirección transversal]`

Cuando se invoca con las direcciones `siguiente` o `anterior`, el jugador se teletransporta lejos de su posición a un área diferente llamada "marco".

Este comando sólo puede ser llamado en un realm.

## Frames

Cada fotograma es un volumen 64x64x64 y está organizado y apilado de una manera que crea 64 fotogramas en un volumen de reino 256x256x256. Esto se visualiza mejor con el comando `/template animation` que es una plantilla de salas vacías optimizadas para este comando.

Los marcos a los que el jugador se teletransporta son ordenados por XZY. Si no se puede acceder a más fotogramas, se utilizará el último fotograma en el extremo transversal opuesto.
