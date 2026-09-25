// ANTES (version insegura, datos ficticios)
const API_TOKEN = "demo-token-123ABC";

function autenticarUsuario(user: { id: string; name: string; password: string }) {
  console.log(user); // expone el objeto completo, incluyendo password
}
