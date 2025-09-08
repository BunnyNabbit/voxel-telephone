---
title: "/vcr"
contributors: [ "BunnyNabbit \"Aon\"" ]
summary: "Ativa o modo VCR em um nível."
---

# /vcr

Ativa o modo VCR em um nível, permitindo visualizar estados anteriores do nível e alternar entre eles.

Alterações de blocos e comandos são sempre salvas e podem ser revertidas se necessário.

Se o VCR estiver ativado, os comandos para voltar (`/rewind <ações>`) e avançar (`/fastforward <ações>`) tornam-se utilizáveis. voltar e avançar afeta apenas a pré-visualização e não altera o estado do nível até que seja confirmado com o comando `/commit`.

## Comandos relacionados

- `/rewind <ações>` - desfaz ações.
- `/fastforward <ações>` - refaz ações desfeitas.
- `/commit` - carrega o estado atual visto na pré-visualização do VCR. Substituirá o registro de alterações.
- `/abort` - aborta a pré-visualização do VCR, carregando o estado como estava antes de ativar o VCR.
