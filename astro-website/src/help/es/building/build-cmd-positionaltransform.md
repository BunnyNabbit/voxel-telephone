---
title: "/Transformación Posicional"
contributors: [ "BunnyNabbit \"Aon\"" ]
summary: "Transforma una selección. Se puede utilizar para mover, copiar, voltear o girar una selección de bloques."
image: "./positionaltransform-espejo-dragons.webp"
imageAlt: "Un dragón negro con ojos cian y vientre blanco está siendo reflejado horizontalmente por su mano. El dragón está en forma bípedal y tiene una mano levantada más cerca del centro que la otra."
---

# /Transformación Posicional

Transforma una selección de bloques. Se puede utilizar para mover, copiar, voltear o girar una selección de bloques. Con los parámetros por defecto, moverá una selección de bloques sin transformaciones adicionales aplicadas.

Diseño del comando: `/positionaltransform &enum:mode &enum:rotation &enum:flipAxis position:positionStart position:positionEnd position:offsetPosition position:pastePosition`

Alias: `/move`

## Modos

El parámetro `&enum:mode` se utiliza como modo base. Es `move` por defecto,

- `move` Mueve la selección limpiando la selección con aire.
- `copiar` reserva la selección original.
- `moveAir` Igual que `move` pero pega bloques de aire sobre el área de pegado.
- `copyAir` Igual que `copiar` pero pega bloques de aire sobre el área de pegado.

## Espinar

Una selección puede girar en sentido horario o en sentido contrario a las agujas del reloj usando el parámetro `&enum:rotation`.

- `ninguno` Ninguna transformación de rotación aplicada.
- `clockwise`
- `counterclockwise`

Ejemplo: `/positionaltransform mueve en sentido horario`. Marca la selección en el sentido del reloj.

![Dos relojes están dispuestos lado a lado. El reloj de la izquierda tiene su mano roja apuntando a la derecha y el reloj de la derecha apunta hacia abajo.](./positionaltransform-clocks.webp)

## Volteando

Ejemplo: `/positionaltransform copy none x`. Copia y vuelca una selección por su eje X.

![Un dragón negro con ojos cian y abrazo blanco está siendo reflejado horizontalmente por su mano. El dragón está en forma bípeda y tiene una mano más cerca del centro que la otra.](./positionaltransform-mirrored-dragons.webp)

- `ninguno` No se ha aplicado ninguna transformacin de vuelta.
- `x` Voltear por x axis.
- `y` Voltear por eje y.
- `z` Voltear por z eje.
