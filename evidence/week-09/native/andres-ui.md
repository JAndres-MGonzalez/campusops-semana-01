# Semana 9 — Recorrido de CampusOps en Android

Nombre: Juan Andrés Medina González

Equipo: 9A-E08

El APK se compiló fuera de OneDrive, en `C:\CampusOps-w08`, y se instaló en
`CampusOps_W08`, Android 16/API 36, x86_64. El código y hash del APK están en
`andres-build.json`. Las fuentes de la app no cambiaron entre esa compilación y
la integración técnica `d14a5a8d96721cd858284ea1f135c3a051647f8e`.

## Preparación reproducible

Requisitos: Node 22.22.0, JDK 17, Android SDK, NDK 27.1.12297006 y emulador.
El APK release de laboratorio incluye JavaScript y utiliza la firma debug
generada por Expo. No representa una publicación en tienda ni un APK para ARM.

Desde una copia de la versión entregada en una ruta corta:

```powershell
npm.cmd ci
npm.cmd run native:generate
New-Item -ItemType Directory -Path android/app/src/release/res/xml -Force
Copy-Item evidence/week-09/native/release-config/AndroidManifest.xml android/app/src/release/AndroidManifest.xml
Copy-Item evidence/week-09/native/release-config/res/xml/campusops_lab_network.xml android/app/src/release/res/xml/campusops_lab_network.xml
$env:NODE_ENV = 'production'
$env:EXPO_PUBLIC_COURSE_BACKEND_URL = 'http://10.0.2.2:4319'
.\android\gradlew.bat -p android :app:assembleRelease -PreactNativeArchitectures=x86_64 --max-workers=4 --console=plain
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk
adb -s emulator-5554 shell am start -n mx.edu.dmi.engineeringapp/.MainActivity
```

El overlay permite HTTP sólo hacia `10.0.2.2`, dirección del host desde el
emulador. Para el backend local, en otra terminal:

```powershell
$env:COURSE_BACKEND_PORT = '4319'
node course-backend/server.mjs
```

## Pasos y observaciones

1. Se abrió sesión como reportante y «Nueva incidencia». La descripción fue
   `Prueba ficticia semana 9` y la búsqueda `Zona ficticia A`. El proveedor
   devolvió `Edificio de prueba A`; apareció «Ubicación sugerida por el proveedor»
   (`andres-01-provider.png`).
2. Se guardó en línea. El detalle mostró `campus-inc-101`, versión 1, y la lista
   mostró la incidencia (`andres-02-saved-online.png`, `andres-03-list-online.png`).
3. Se cerró y abrió sesión para contar con un token vigente. En otro formulario
   se escribieron `Incidencia manual sin conexion semana 9` y
   `Zona manual ficticia B`.
4. Se cortó únicamente el acceso del emulador al puerto del backend. «Buscar
   ubicación» devolvió el aviso de alternativa manual y mantuvo el texto
   (`andres-04-manual-offline.png`).
5. «Guardar incidencia» dejó una operación pendiente y mostró el detalle local
   con la ubicación manual (`andres-05-saved-offline.png`).
6. Se restableció el acceso y se pulsó «Sincronizar pendientes». La cola pasó
   de 1 a 0 y apareció la confirmación. La app volvió automáticamente a la lista
   (`andres-06-confirmed.png`, `andres-07-list-confirmed.png`).
7. Al abrir la incidencia, el servidor devolvió `campus-inc-102`, versión 1,
   estado Abierta y la ubicación manual (`andres-08-detail-confirmed.png`).

La interrupción usó este emulador de pruebas con acceso root:

```powershell
adb -s emulator-5554 root
adb -s emulator-5554 shell iptables -I OUTPUT -p tcp -d 10.0.2.2 --dport 4319 -j REJECT
# Repetir búsqueda y guardado; después retirar la misma regla:
adb -s emulator-5554 shell iptables -D OUTPUT -p tcp -d 10.0.2.2 --dport 4319 -j REJECT
```

La regla se retiró al terminar. No se cambió el firewall de Windows. Los PNG
provienen del emulador; los XML acompañantes conservan los textos y controles.
Los hashes están en `andres-build.json`, y la validación de las capturas y el
log de la app en `../logs/andres-emulador.log`. La salida de Metro durante la
compilación está en `../logs/native-release-build.log`; el APK no necesita un
servidor Metro activo durante este recorrido.

## Límites

Se utilizaron únicamente datos ficticios. Los IDs son los observados en este
backend recién iniciado y pueden variar al repetir el recorrido. El guardado
sin conexión se comprobó con sesión vigente. Las capturas de Ismael que muestran
un rechazo de permiso se conservan como diagnóstico; este recorrido no acredita
guardar después de que la renovación de sesión falla sin conexión.
