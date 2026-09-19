# Escudos de los equipos

Suelta aquí los seis archivos y listo. No hay que tocar código ni recompilar
nada: el backend los sirve en `/static/crests/{CODIGO}.png` y los dos clientes
los piden por URL.

```
static/crests/AGU.png    Águilas Cibaeñas
static/crests/TOR.png    Toros del Este
static/crests/EST.png    Estrellas Orientales
static/crests/GIG.png    Gigantes del Cibao
static/crests/ESC.png    Leones del Escogido
static/crests/LIC.png    Tigres del Licey
```

El nombre del archivo es el código de tres letras en MAYÚSCULAS, tal como está
en `src/constants.py`. Cualquier otro nombre no se encuentra.

## Formato

- **PNG con transparencia.** El fondo de la app es casi negro; un escudo con
  fondo blanco se ve como una calcomanía pegada.
- **Cuadrado, 256×256.** El badge más grande de la app mide 40 pt, que en una
  pantalla 3x son 120 px reales. 256 sobra y deja margen si algún día crece.
- **Menos de 50 KB cada uno.** Se piden en cada fila de una tabla; un escudo de
  medio mega multiplicado por diez filas se nota en datos móviles.

## Qué pasa si falta uno

Nada se rompe. El badge cae a las siglas sobre el color del equipo, que es
exactamente lo que la app mostraba antes. Puedes poner tres hoy y tres mañana.

## Sobre estos archivos

Los escudos son marcas registradas de los seis clubes, no del proyecto. Por eso
viven aquí y no empaquetados dentro de la app, y por eso la carpeta está en
`.gitignore`: el repositorio es público y estos archivos no son nuestros para
redistribuirlos.

Si decides que deben ir en el repositorio, es quitar una línea del `.gitignore`.
Es tu decisión y es reversible; lo que no conviene es que ocurra sin haberla
tomado.

En el despliegue, los archivos van al volumen o a la imagen junto con el resto
de `static/`.
