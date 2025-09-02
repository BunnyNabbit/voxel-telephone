---
title: "/animation"
contributors: ["BunnyNabbit \"Aon\""]
summary: "Fornece uma ferramenta básica para explorar a ilusão visual de movimento."
---

# /animation

Uso: `/animation [direção da travessia]`

Quando invocado com as direções `next` ou `previous`, o jogador é teleportado de sua posição para uma área diferente chamada "quadro".

Este comando só pode ser usado em um realm.

## Quadros

Cada quadro é um volume de 64x64x64 e são organizados e empilhados de forma a criar 64 quadros em um volume de 256x256x256 do realm. Isso é melhor visualizado com o comando `/template animation`, que é um template de salas ocas otimizadas para este comando.

Os quadros para os quais o jogador é teleportado são ordenados por XZY. Se não houver mais quadros acessíveis, o último quadro no extremo oposto da travessia será usado.