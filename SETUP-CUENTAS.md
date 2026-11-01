# Activación de cuentas y seguimiento

## En el proyecto de Netlify

1. En el proyecto `reglasdejuego`, abre **Project configuration → Identity** y selecciona **Enable Identity**.
2. En **Registration**, deja el registro abierto para que cada árbitro pueda crear su cuenta.
3. Mantén activa la confirmación por correo. Cada persona creará su cuenta con nombre completo, correo y contraseña.
4. Despliega la versión que incluye `netlify/functions/` y la compilación `dist/`.

## Hacer administrador al dueño del seguimiento

1. Abre `https://reglasdejuego.netlify.app`, crea tu cuenta con tu nombre y confirma el correo.
2. En el proyecto de Netlify, abre **Identity → Users**, elige tu cuenta y asígnale el rol personalizado `admin`.
3. Cierra sesión y vuelve a entrar. El rol aparece al renovar la sesión; entonces verás **Seguimiento** en la cabecera.

Las cuentas nuevas reciben el rol `member`. El panel **Seguimiento** y su función del servidor comprueban el rol `admin`; los usuarios normales solo pueden consultar y guardar sus propios resultados.

