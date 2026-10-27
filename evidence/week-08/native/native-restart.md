# Semana 8 — Persistencia y sincronización en Android

Aplicación: CampusOps. Paquete: `mx.edu.dmi.engineeringapp`.
Entorno: Android 16/API 36, emulador x86_64 `CampusOps_W08`.
Se compiló en `C:\CampusOps-w08`, fuera de OneDrive y sin espacios ni acentos.
El SHA del código, entorno y hash del APK están en `build.json`.
El APK de laboratorio usa la firma debug generada por Expo; no es una publicación en tienda.

## Compilación

Se usaron Node 22.22.0, JDK 17, SDK Platform 36, Build Tools 35/36,
NDK 27.1.12297006 y CMake 3.22.1. Android Studio tenía Java 25;
se utilizó un JDK 17 portátil para cumplir el entorno del README.

```powershell
npm.cmd ci
npm.cmd run native:generate
New-Item -ItemType Directory -Path android/app/src/release/res/xml -Force
Copy-Item evidence/week-08/native/release-config/AndroidManifest.xml android/app/src/release/AndroidManifest.xml
Copy-Item evidence/week-08/native/release-config/res/xml/campusops_lab_network.xml android/app/src/release/res/xml/campusops_lab_network.xml
.\android\gradlew.bat -p android :app:assembleRelease -PreactNativeArchitectures=x86_64 --max-workers=4 --console=plain
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell setprop debug.hwui.drawing_enabled 1
adb -s emulator-5554 shell am start -n mx.edu.dmi.engineeringapp/.MainActivity
```

El backend didáctico se ejecutó con `node course-backend/server.mjs`, accesible
sólo en la laptop. El APK usa `http://10.0.2.2:4310`. El overlay permite HTTP
únicamente a esa dirección de laboratorio. La variante release incluye el
JavaScript y no necesita servidor de desarrollo. La salida real está en
`evidence/week-08/logs/native-release-build.log`.

## Reinicio y contenido

1. Coordinación preparó `campus-inc-001` asignada a `technician-1`, versión 5.
2. En la app se inició sesión como técnico, se abrió el detalle y se escribieron
   la nota `Revision ficticia sin conexion` y la referencia
   `foto://campus-ficticio/pendiente-02.jpg`.
3. Se interrumpió únicamente el acceso del emulador al backend de laboratorio.
4. Se pulsó «Iniciar atención». La operación quedó en AsyncStorage real.
5. Se leyó la cola de SQLite y se cerró y volvió a abrir el proceso Android:

```powershell
adb -s emulator-5554 shell am force-stop mx.edu.dmi.engineeringapp
adb -s emulator-5554 shell am start -n mx.edu.dmi.engineeringapp/.MainActivity
```

`01-before-close.json` y `02-after-restart.json` muestran procesos 2985 y 3293.
La cola conservó exactamente el mismo SHA-256:
`da56ea33b1d2d08609784bd09dfe2411d04b8d6d6940bf6acfb6a07aab354f75`.
Se conservaron identidad, autor, versión base, nota y referencia de fotografía.
Las capturas y jerarquías XML tienen los mismos nombres que esos registros.

Para leer únicamente la cola del paquete de prueba, se utilizó `sqlite3` del
emulador sobre `/data/user/0/mx.edu.dmi.engineeringapp/databases/AsyncStorage`,
tabla `Storage`, clave `campusops.queue.pending`. No se leyeron tokens de sesión.

## Reasignación y conflicto

Mientras la app estaba cerrada y sin acceso al backend, coordinación ejecutó
`assign` con versión base 5 y `technicianId=technician-2`. La incidencia quedó
en versión 6. Se restituyó el acceso y se inició sesión nuevamente como técnico.

La app informó la reasignación y conservó el pendiente. El servidor siguió en
versión 6 con `technician-2`: la sincronización no impuso la asignación anterior.
`03-conflict.json`, `remote-reassignment.json` y `remote-after-conflict.json`
permiten contrastar ambos hechos. `03-conflict.png` muestra el aviso y la intención local.

## Resolución, confirmación e idempotencia

Coordinación devolvió expresamente la asignación a `technician-1`, con versión
base 6. Al pulsar «Sincronizar pendientes», la app usó la versión remota 7,
confirmó el inicio y dejó vacía la cola. El servidor quedó en versión 8,
`in_progress`. Sólo entonces desapareció la operación (`04-confirmed.json`).

Se repitió por HTTP la misma operación, con igual cuerpo y clave de idempotencia.
`idempotency.json` registra `duplicate=true`, versión 8 y un único efecto para
esa identidad. La repetición no volvió a cambiar la incidencia.

## Falla encontrada y corrección

Una sesión vencida sin conexión se confundía con una reasignación. El servidor
seguía asignado al mismo técnico, pero se generaba `OutboxConflictError`.
Dos pruebas adicionales reprodujeron la falla. Ahora sólo se clasifica pérdida
de visibilidad ante un 403 o 404 real; un 401 o un error local de sesión conserva
el pendiente sin inventar una reasignación.

El diagnóstico está en `evidence/week-08/logs/auth-conflict-original.log` y la
ejecución corregida en `evidence/week-08/logs/integration-tests-final.log`:
110 pruebas aprobadas en 18 suites.

## Alcance

Se comprobó cierre real del proceso Android y almacenamiento SQLite de la app.
No se cerró únicamente una instancia de cola de Jest. La referencia de foto es
un metadato sintético: esta prueba no acredita carga de archivos. Se utilizaron
únicamente actores, ubicaciones y notas ficticias.
