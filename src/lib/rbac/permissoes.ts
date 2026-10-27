// Regras de acesso do hub, as mesmas de has_permission() e can_see_escopo() no
// banco do Supabase (legado/supabase-usuarios-inativar.sql e
// legado/supabase-desempenho-regras.sql). Conta inativa não tem acesso a nada.
// A versão em vigor no Supabase é conferida contra o dump no import (fase A3).

export type Escopo = {
  perfil: string | null;
  status: string | null;
  permissoes: Record<string, unknown> | null;
  unidades: string[] | null;
  departamentos: string[] | null;
};

const ativo = (u: Escopo | null | undefined): u is Escopo => !!u && (u.status ?? "ativo") === "ativo";

export function temPermissao(usuario: Escopo | null | undefined, chave: string): boolean {
  if (!ativo(usuario)) return false;
  if (usuario.perfil === "admin") return true;
  return usuario.permissoes?.[chave] === true;
}

export function temAlguma(usuario: Escopo | null | undefined, chaves: string[]): boolean {
  return chaves.some((k) => temPermissao(usuario, k));
}

const norm = (s: string) => s.trim().toLowerCase();

// can_see: admin vê tudo; gestor e RH ficam presos às unidades/departamentos do
// cadastro (lista vazia = sem restrição). Linha sem unidade passa no filtro de
// unidade; linha sem departamento NÃO passa quando há departamentos no recorte.
export function podeVer(usuario: Escopo | null | undefined, unidade: string | null, departamento: string | null): boolean {
  if (!ativo(usuario) || !usuario.perfil) return false;
  if (usuario.perfil === "admin") return true;
  if (usuario.perfil !== "gestor" && usuario.perfil !== "rh") return false;
  const unidades = (usuario.unidades ?? []).map(norm);
  const departamentos = (usuario.departamentos ?? []).map(norm);
  const okUnidade = unidades.length === 0 || unidade == null || unidades.includes(norm(unidade));
  const okDepto = departamentos.length === 0 || (departamento != null && departamentos.includes(norm(departamento)));
  return okUnidade && okDepto;
}

// Igual a podeVer, para filtrar listas no servidor antes de mandar ao navegador.
export function filtrarRecorte<T>(
  usuario: Escopo | null | undefined,
  linhas: T[],
  campos: (l: T) => { unidade: string | null; departamento: string | null },
): T[] {
  return linhas.filter((l) => {
    const c = campos(l);
    return podeVer(usuario, c.unidade, c.departamento);
  });
}
