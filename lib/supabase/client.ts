import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente do navegador.
 *
 * Só a chave publicável entra aqui — quem faz a segurança é o RLS, no banco.
 * É o mesmo cliente que vai rodar dentro do app Android empacotado, e por
 * isso ele não pode depender de nada do servidor do Next.
 */

let cliente: SupabaseClient | undefined;

export function supabaseBrowser(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !chave) {
    throw new Error(
      "faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Para desenvolvimento local, rode `npx supabase start` e copie os " +
        "valores que ele imprime para .env.local",
    );
  }

  cliente = createClient(url, chave, { auth: { persistSession: true } });
  return cliente;
}
