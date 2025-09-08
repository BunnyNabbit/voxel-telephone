---
title: "/commit"
contributors: [ "BunnyNabbit \"Aon\"" ]
summary: "Salva o estado atual do VCR como estado do nível."
---

# /commit

Pode ser usado se o VCR estiver ativado com `/vcr`.

Salva o estado visto no VCR como o estado atual do nível e desativa o modo VCR, permitindo que o nível seja editado. Ações que foram desfeitas não podem ser restauradas após o estado do nível ser confirmado.

Para cancelar o VCR sem salvar o estado, use `/abort`.
