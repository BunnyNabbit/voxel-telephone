---
title: "/vcr"
contributors: [ "BunnyNabbit \"Aon\"" ]
summary: "Activa el modo VCR en un nivel."
---

# /vcr

Activa el modo VCR en un nivel, permitiendo que los estados de nivel anterior sean vistos y cambiados.

Los cambios de bloque y los comandos siempre se guardan y pueden ser revertidos si es necesario.

Si la VCR está habilitada, los comandos de rebobinado (`/rewind <actions>`) y de reenvío rápido (`/fastforward <actions>`) se vuelven utilizables. Rebobinar y reenviar rápidamente sólo afecta a la vista previa y no afecta al estado del nivel hasta que haya sido confirmado con el comando `/commit`.

## Comandos relacionados

- `/rewind <actions>` - deshace acciones.
- `/fastforward <actions>` - redos acciones reventadas.
- `/commit` - carga el estado actual visto en la vista previa de VCR. anulará el registro de cambios.
- `/abort` - aborta la vista previa de VCR, cargando el estado tal y como estaba antes de habilitar VCR.
