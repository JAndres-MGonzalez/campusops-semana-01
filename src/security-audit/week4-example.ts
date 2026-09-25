// week4-example.ts — ejemplo creado para demostrar buenas practicas (Auditoria Semana 4)
// version corregida (ver docs/evidence para el "antes")

const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;

function autenticarUsuario(user: { id: string; name: string; password: string }) {
  console.log({ userId: user.id, status: "authenticated" });
}
