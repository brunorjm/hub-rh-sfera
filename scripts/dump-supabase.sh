#!/usr/bin/env bash
# Baixa uma cópia do banco do Supabase de produção para _local/supabase.dump.
# Só LÊ o Supabase. Pede só a senha do banco, sem eco; ela vai para o pg_dump
# por variável de ambiente (PGPASSWORD) e não fica em arquivo nem no histórico.
#
# Uso (Git Bash): bash scripts/dump-supabase.sh
# Host e usuário: Supabase → Connect → Direct → Session pooler (não são segredo).
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash converte "/out" em "C:/Program Files/Git/out" ao chamar o docker.
export MSYS_NO_PATHCONV=1

SUPA_HOST="${SUPA_HOST:-aws-0-sa-east-1.pooler.supabase.com}"
SUPA_USER="${SUPA_USER:-postgres.ttjgjwfbzkczyxhigbte}"

mkdir -p _local
read -rsp "Senha do banco do Supabase (só a senha): " PGPASSWORD; echo
[ -n "$PGPASSWORD" ] || { echo "Senha vazia."; exit 1; }
export PGPASSWORD

echo "→ Gerando o dump de $SUPA_USER@$SUPA_HOST (public, auth e conexao_private)…"
docker run --rm -e PGPASSWORD -v "$(pwd -W 2>/dev/null || pwd)/_local:/out" postgres:17-alpine \
  pg_dump -h "$SUPA_HOST" -p 5432 -U "$SUPA_USER" -d postgres \
  -Fc --no-owner --no-privileges -n public -n auth -n conexao_private -f /out/supabase.dump
unset PGPASSWORD

ls -la _local/supabase.dump
echo "✓ Dump salvo em _local/supabase.dump (tem dado pessoal: não compartilhe nem commite)."
