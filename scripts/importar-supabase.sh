#!/usr/bin/env bash
# Importa o dump do Supabase (_local/supabase.dump) no Postgres LOCAL do compose.
# APAGA e recria o banco hub_rh do container local — nunca aponte para outro banco.
#
# Uso: bash scripts/importar-supabase.sh
# Saída: _local/import/ (log do restore, contagens e conferência). Contém dado
# pessoal: fica fora do git como o resto de _local/.
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash converte "/importar/..." em "C:/Program Files/Git/importar/..." ao chamar o docker.
export MSYS_NO_PATHCONV=1

DUMP=_local/supabase.dump
OUT=_local/import
[ -f "$DUMP" ] || { echo "Falta $DUMP (rode o pg_dump antes)."; exit 1; }
mkdir -p "$OUT"

dc() { docker compose exec -T db "$@"; }
psql_hub() { dc psql -U hub -d hub_rh -v ON_ERROR_STOP=1 -q "$@"; }

echo "→ Recriando o banco local hub_rh"
dc psql -U hub -d postgres -v ON_ERROR_STOP=1 -q -c "drop database if exists hub_rh with (force)" -c "create database hub_rh"

echo "→ Passo 1: papéis, extensões e auth.uid()"
psql_hub < scripts/sql/importar-01-pre.sql

echo "→ Restaurando auth.users, conexao_private e public"
dc pg_restore -U hub -d hub_rh --no-owner --no-privileges -n auth -t users /importar/supabase.dump 2> "$OUT/restore-auth.log" || true
# -t traz a tabela e os dados, mas não a chave primária; sem ela as FKs para
# auth.users (ex.: profiles.id) não são criadas no restore do public.
psql_hub -c "alter table auth.users add primary key (id)"
dc pg_restore -U hub -d hub_rh --no-owner --no-privileges -n conexao_private -n public /importar/supabase.dump 2> "$OUT/restore-public.log" || true
# Erros esperados: "schema public already exists" e comentários de extensão.
grep -E "^pg_restore: error" "$OUT"/restore-*.log | grep -vE 'schema "public" already exists|extension' > "$OUT/erros-restore.log" || true
if [ -s "$OUT/erros-restore.log" ]; then
  echo "⚠ Erros no restore (ver $OUT/erros-restore.log):"; head -20 "$OUT/erros-restore.log"
fi

echo "→ Passo 2: usuarios, sem RLS e sem papéis do Supabase"
psql_hub < scripts/sql/importar-02-pos.sql

echo "→ Contagem de linhas no dump x no banco"
dc pg_restore -a -n public -n conexao_private -f - /importar/supabase.dump \
  | awk '/^COPY /{t=$2; n=0; next} /^\\\.$/{if(t!=""){print t"\t"n}; t=""; next} t!=""{n++}' \
  | sed 's/"//g' | sort > "$OUT/linhas-dump.tsv"
psql_hub -At -F $'\t' < scripts/sql/importar-03-conferencia.sql > "$OUT/conferencia.txt"
awk -F'\t' '/^== linhas/{f=1; next} /^==/{f=0} f && NF==2' "$OUT/conferencia.txt" | sort > "$OUT/linhas-banco.tsv"
if diff <(grep -v "^public._policies_supabase" "$OUT/linhas-banco.tsv" | grep -v "^public.usuarios") "$OUT/linhas-dump.tsv" > "$OUT/linhas-diff.txt"; then
  echo "✓ Linhas por tabela: banco = dump ($(wc -l < "$OUT/linhas-dump.tsv") tabelas)"
else
  echo "✗ Linhas diferentes entre dump e banco (ver $OUT/linhas-diff.txt)"; exit 1
fi
echo "✓ usuarios: $(psql_hub -At -c 'select count(*) from public.usuarios')"
echo "→ Conferência completa em $OUT/conferencia.txt"
