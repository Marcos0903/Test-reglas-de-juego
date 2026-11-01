# Árbitro · Entrenamiento de balonmano

Web adaptable a móvil y escritorio, con cuentas de Netlify Identity y progreso compartido mediante Netlify Blobs. Cada cuenta ve su propio historial; las cuentas con rol `admin` pueden consultar el seguimiento global. El backend necesita Identity activado en Netlify y que el dueño del sitio se asigne ese rol después de registrarse.

## Banco de preguntas

`questions.js` es la fuente del banco. La carga inicial contiene 429 de las 430 preguntas del catálogo español corregido el 1 de enero de 2026. Se excluye la pregunta 7.36 porque no aparece con clave en el solucionario oficial de julio de 2025. Las 429 preguntas cargadas tienen su ID y todas sus letras de respuesta cotejadas con una fila del solucionario. No se ha inferido ninguna clave.

Añade preguntas únicamente después de cotejar el enunciado y sus opciones con el catálogo español y cada clave con el solucionario oficial. El examen se habilita con al menos 25 preguntas verificadas.

Formato:

```js
window.QUESTION_BANK = {
  source: "Catálogo español IHF · edición enero 2026",
  answerKey: "Solucionario oficial IHF · julio 2025",
  verified: true,
  questions: [{
    id: "1.1",
    text: "Enunciado transcrito del catálogo",
    options: [{ key: "a", text: "Opción A" }, { key: "b", text: "Opción B" }],
    correct: ["a"],
    reference: "1:1"
  }]
};
```

La corrección exige que coincida el conjunto completo de respuestas. Mantén IDs únicos y opciones con letras consistentes. Las futuras secciones de reglas completas y minitest pueden añadirse como modos que consuman este mismo banco y una taxonomía temática.

## Publicación

La compilación crea `dist/` y despliega las Netlify Functions de `netlify/functions/`. Se puede desplegar con `npm run build` en Netlify. Sigue [SETUP-CUENTAS.md](SETUP-CUENTAS.md) para habilitar Identity y asignar el primer rol de administración.

