// Porte da parte pura de legado/js/galho.js (HUB_GALHO).
//
// "Galho" da pessoa logada: a linha de liderança acima dela e toda a equipe
// abaixo, devolvidos pela função organograma_meu_galho() do banco. Usado pelo
// Organograma e pelo Headcount de quem não tem a permissão de ver a empresa inteira.
//
// Fora do porte: get() e cached() — buscam a RPC organograma_meu_galho e guardam
// em cache amarrado a HUB_DATA.colaboradores (ver ACESSO-A-DADOS.md). Aqui ficam
// a chave de cruzamento, o texto do motivo e a montagem do conjunto de ids que
// get() fazia depois da busca.
import { normalizeText, type Linha } from '@/lib/calculos/utils';

export interface ResultadoGalho {
  rows: Linha[];
  erro?: string;
  ids?: Set<string>;
}

// Chave de cruzamento com HUB_DATA.colaboradores: ID da Feedz; nome completo
// só quando a linha não tem ID.
export function chave(r: Linha): string {
  return r.external_id ? 'id:' + r.external_id : 'nome:' + normalizeText(r.nome_completo || r.nome || '');
}

// Trecho de get() depois da busca: headcount conta a pessoa e a equipe abaixo
// dela, nunca a liderança acima.
export function idsDoGalho(rows: Linha[]): Set<string> {
  return new Set(rows.filter(r => r.relacao !== 'acima').map(chave));
}

// Texto para explicar por que o galho veio vazio.
export function motivo(res: ResultadoGalho): string {
  if (res.erro) {
    return /organograma_meu_galho|function|funç/i.test(res.erro)
      ? 'A visão por equipe ainda não foi ativada no banco. Peça ao administrador para rodar supabase-organograma.sql no Supabase.'
      : 'Não foi possível carregar a sua equipe: ' + res.erro;
  }
  return 'Seu login não está ligado a um colaborador do Feedz, então não dá para saber qual é a sua equipe. Peça ao administrador para escolher o seu nome no campo “Colaborador no Feedz” em Administração → Cadastro de Acessos.';
}
