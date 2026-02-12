# Sistema de Misiones (Vanilla JS)

Aplicación **sin frameworks** (solo JavaScript, HTML y CSS) para administrar ofrendas de misiones por persona y por mes.

## Funcionalidades

- Login de administrador.
- Registro de personas con campos obligatorios:
  - Nombre
  - Teléfono
  - Monto prometido
- Abono inicial opcional.
- Edición de personas.
- Registro/edición mensual de abonos por persona.
- Exportación de PDF por persona con título **"Reporte de misiones"**, logo y tabla mensual.
- Diseño mobile-first, responsive y con animaciones.

## 1) Configurar Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/) y crea un proyecto.
2. En **Authentication**:
   - Habilita método **Email/Password**.
   - Crea el usuario admin con:
     - Email: `adminicpacrMisiones@icpacrmisiones.com`
     - Password: `Efesios220Misiones`
3. En **Firestore Database**:
   - Crea la base en modo producción o prueba.
   - Colección usada por la app: `people`.
4. En **Project settings > General > Your apps**, crea una app web y copia el objeto de configuración.

### Crear archivo de configuración local

1. Duplica `firebase-config.example.js` a `firebase-config.js`.
2. Puedes usar este contenido:

```js
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};

export const adminAuthConfig = {
  username: "adminicpacrMisiones",
  password: "Efesios220Misiones",
  email: "adminicpacrMisiones@icpacrmisiones.com"
};
```

3. Luego reemplaza el bloque `firebaseConfig` y `ADMIN_CONFIG` en `app.js` (o si prefieres, impórtalo desde `firebase-config.js`).

## 2) Reglas básicas sugeridas de Firestore

En Firestore Rules puedes empezar con:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /people/{personId} {
      allow read, write: if request.auth != null;

      match /contributions/{monthId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

## 3) Usar logo personalizado

- El proyecto trae un logo SVG base en `assets/logo-misiones.svg`.
- Si quieres usar exactamente tu imagen adjunta, reemplázala por `assets/logo-misiones.svg` o adapta en `index.html` y `app.js`.

## 4) Desplegar en Vercel

1. Sube este proyecto a GitHub.
2. En Vercel: **New Project** > selecciona repositorio.
3. Como es estático, no necesita comandos especiales.
4. Deploy.

## Estructura de datos (Firestore)

- `people/{personId}`
  - `name` (string)
  - `phone` (string)
  - `promisedAmount` (number)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp opcional)
- `people/{personId}/contributions/{YYYY-MM}`
  - `month` (string)
  - `amount` (number)
  - `updatedAt` (timestamp)
