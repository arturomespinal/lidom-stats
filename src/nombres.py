"""
src/nombres.py — Cómo se escriben en pantalla los nombres de DIGIMETRICS.

La fuente escribe los años viejos en mayúsculas, sin tildes y con
abreviaturas de planilla: "DIOM. (GUAYUBIN) OLIVO", "FED. (CHICHI) OLIVO",
"JESUS ROJAS ALOU". En los récords, que es lo más vistoso de la app, eso se
leía como un volcado de base de datos. Aquí se arregla en cuatro pasos, en
este orden:

1. **Excepciones con nombre propio** (`CONOCIDOS`): los que el béisbol
   dominicano conoce por otro nombre que el de la planilla. Los hermanos Alou
   figuran con su primer apellido (Rojas) y nadie los llama así; Rico Carty
   aparece como "Ricardo". Pocos y escritos a mano, porque un cambio de
   nombre no se deduce.
2. **Mayúsculas a tipo título**, con los "Mc" y las partículas ("De Los
   Santos") como se escriben en RD.
3. **Abreviaturas** de nombre de pila ("Fdo." → Fernando). Solo las que no
   tienen dos lecturas: "Ed." puede ser Eduardo o Edward y se queda.
4. **Apodos**: el paréntesis pasa a comillas ("Manuel "Bonny" Castillo"). Si
   el apodo viene al final, va después del nombre de pila.
5. **Tildes** que la planilla no lleva (o lleva a medias: "Nuñez"), palabra
   por palabra contra listas cerradas. `SOLO_NOMBRE` vale solo como nombre de pila, porque como apellido
   tiene otra lectura (Billy Martin no es Martín).

Solo para los nombres de DIGIMETRICS. Los de la MLB API son el registro
oficial del jugador y se muestran tal cual.

La comparación (enlazar, buscar) sigue usando `normalizar_nombre()` en
`src/historia.py`, que quita tildes y signos: lo que se muestra no cambia lo
que se encuentra, salvo que el buscador mira también el nombre mostrado, para
que "diomedes" encuentre a "DIOM. GUAYUBIN OLIVO".
"""

from __future__ import annotations

import re
import unicodedata


def _clave(nombre: str) -> str:
    """Sin tildes, sin signos, en minúsculas: la llave de las tablas de abajo."""
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", " ", s)
    return " ".join(s.split())


# Nombre de la planilla (en `_clave`) → cómo lo conoce la liga.
CONOCIDOS: dict[str, str] = {
    "diom guayubin olivo": 'Diómedes "Guayubín" Olivo',
    "fed chichi olivo": 'Federico "Chichí" Olivo',
    "felipe rojas alou": "Felipe Alou",
    "mateo rojas alou": "Mateo Alou",
    "jesus rojas alou": "Jesús Alou",
    "ricardo carty": "Rico Carty",
}

# Abreviaturas de planilla sin ambigüedad.
ABREVIATURAS: dict[str, str] = {
    "fdo": "Fernando",
    "fed": "Federico",
    "diom": "Diómedes",
    "ant": "Antonio",
    "fco": "Francisco",
}

# Nombres de pila que en DIGIMETRICS vienen sin tilde. Valen también como
# segundo nombre ("Julio César").
NOMBRES: dict[str, str] = {
    "jesus": "Jesús", "jose": "José", "ramon": "Ramón", "andres": "Andrés",
    "rene": "René", "julian": "Julián", "adrian": "Adrián", "ruben": "Rubén",
    "ivan": "Iván", "sebastian": "Sebastián", "hector": "Héctor",
    "victor": "Víctor", "oscar": "Óscar", "cesar": "César", "felix": "Félix",
    "angel": "Ángel", "efrain": "Efraín", "dario": "Darío", "nicolas": "Nicolás",
    "tomas": "Tomás", "joaquin": "Joaquín", "agustin": "Agustín",
    "fermin": "Fermín", "raul": "Raúl", "saul": "Saúl", "lazaro": "Lázaro",
    "maximo": "Máximo", "aristides": "Arístides", "teofilo": "Teófilo",
    "valentin": "Valentín", "damaso": "Dámaso",
    "maria": "María", "anibal": "Aníbal", "elias": "Elías", "isaias": "Isaías",
    "matias": "Matías", "ines": "Inés", "jeronimo": "Jerónimo",
    "moises": "Moisés", "efren": "Efrén", "cristobal": "Cristóbal",
    "alcibiades": "Alcibíades", "milciades": "Milcíades",
    "diomedes": "Diómedes", "nestor": "Néstor", "fabian": "Fabián",
}

# Solo como nombre de pila: como apellido son otra cosa.
SOLO_NOMBRE: dict[str, str] = {
    "martin": "Martín", "simon": "Simón", "roman": "Román", "adan": "Adán",
    "german": "Germán",
}

# Apellidos que en DIGIMETRICS vienen sin tilde.
APELLIDOS: dict[str, str] = {
    "rodriguez": "Rodríguez", "gonzalez": "González", "martinez": "Martínez",
    "perez": "Pérez", "gomez": "Gómez", "hernandez": "Hernández",
    "sanchez": "Sánchez", "ramirez": "Ramírez", "jimenez": "Jiménez",
    "fernandez": "Fernández", "lopez": "López", "diaz": "Díaz", "garcia": "García",
    "mendez": "Méndez", "nunez": "Núñez", "baez": "Báez", "gutierrez": "Gutiérrez",
    "dominguez": "Domínguez", "suarez": "Suárez", "alvarez": "Álvarez",
    "vasquez": "Vásquez", "vazquez": "Vázquez", "velazquez": "Velázquez",
    "marquez": "Márquez", "benitez": "Benítez", "geronimo": "Gerónimo",
    "capellan": "Capellán", "guzman": "Guzmán", "mejia": "Mejía", "munoz": "Muñoz",
    "tavarez": "Tavárez", "encarnacion": "Encarnación", "concepcion": "Concepción",
    "asuncion": "Asunción", "leon": "León", "bolivar": "Bolívar",
    "cespedes": "Céspedes", "galvez": "Gálvez", "alcantara": "Alcántara",
    "dilone": "Diloné", "borbon": "Borbón", "manon": "Mañón", "pena": "Peña",
    "andujar": "Andújar", "chavez": "Chávez", "ordonez": "Ordóñez",
    "ibanez": "Ibáñez", "quinones": "Quiñones", "beltre": "Beltré",
    "fermin": "Fermín", "julian": "Julián", "paez": "Páez", "saez": "Sáez",
    "duran": "Durán",
}

# Las partículas ("De Los Santos", "De La Cruz") se quedan con mayúscula: así
# se escriben en RD y así las trae la MLB API para los mismos jugadores.


def _titulo(palabra: str) -> str:
    """Tipo título con los casos que `str.title()` hace mal."""
    t = palabra.title()
    # "Mccovey" → "McCovey"
    if len(t) > 3 and t.startswith("Mc") and t[2].isalpha():
        t = "Mc" + t[2:].capitalize()
    return t


def _tilde(palabra: str, es_primera: bool) -> str:
    """La palabra con su tilde si está en las listas y la planilla no la trae."""
    # Las listas tienen la grafía completa: "Nuñez" (con eñe y sin tilde)
    # también pasa a "Núñez". Lo que no está en ellas se respeta tal cual.
    k = _clave(palabra)
    if es_primera and k in SOLO_NOMBRE:
        return SOLO_NOMBRE[k]
    if k in NOMBRES:
        return NOMBRES[k]
    if not es_primera and k in APELLIDOS:
        return APELLIDOS[k]
    return palabra


def mostrar_nombre(nombre: str) -> str:
    """El nombre de DIGIMETRICS como se escribe en la app. Ver el docstring del módulo."""
    # Basura de planilla ("JOSE REYES €"): fuera todo lo que no es letra,
    # espacio o los signos que un nombre sí lleva.
    limpio = re.sub(r"[^\w\s.'()\-]", " ", nombre)
    limpio = " ".join(limpio.split())
    if not limpio:
        return limpio
    conocido = CONOCIDOS.get(_clave(limpio))
    if conocido:
        return conocido

    # Separar el apodo antes de tocar mayúsculas: "(MATEO)J." trae el
    # paréntesis pegado.
    apodo = None
    pos_apodo = None
    m = re.search(r"\(([^()]+)\)", limpio)
    if m:
        apodo = m.group(1).strip()
        antes = limpio[: m.start()].strip()
        despues = limpio[m.end():].strip()
        pos_apodo = len(antes.split()) if antes else 0
        limpio = " ".join(p for p in (antes, despues) if p)

    en_mayusculas = limpio == limpio.upper()
    palabras = limpio.split()
    salida: list[str] = []
    for i, p in enumerate(palabras):
        if en_mayusculas:
            p = _titulo(p)
        k = _clave(p)
        if p.endswith(".") and k in ABREVIATURAS:
            p = ABREVIATURAS[k]
        elif not p.endswith("."):
            p = _tilde(p, es_primera=(i == 0))
        salida.append(p)

    if apodo and (len(apodo) == 1 or apodo.upper() in {"JR", "SR", "II", "III"}):
        # "(L)", "(JR)": una marca de planilla para distinguir homónimos, no un
        # apodo. Se queda al final, entre paréntesis, como venía.
        return " ".join(salida) + f" ({apodo.upper() if len(apodo) == 1 else _titulo(apodo)})"
    if apodo:
        a = _titulo(apodo) if apodo == apodo.upper() else apodo
        a = " ".join(_tilde(x, es_primera=True) for x in a.split())
        # Al final o al principio de la planilla, el apodo va después del
        # nombre de pila; en medio, se queda donde estaba.
        if pos_apodo is None or pos_apodo == 0 or pos_apodo >= len(salida):
            pos_apodo = 1
        salida.insert(pos_apodo, f'"{a}"')
    return " ".join(salida)
