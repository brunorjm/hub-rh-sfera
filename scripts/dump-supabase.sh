#!/usr/bin/env bash
# Baixa uma cópia do banco do Supabase de produção para _local/supabase.dump.
# Só LÊ o Supabase. A URL de conexão (com a senha) é digitada na hora, sem eco,
# e não fica em arquivo nem no histórico do shell.
#
# Uso (Git Bash): bash scripts/dump-supabase.sh
# Onde pegar a URL: Supabase → Connect → Session pooler (porta 5432).
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash converte "/out" em "C:/Program Files/Git/out" ao chamar o docker.
export MSYS_NO_PATHCONV=1

mkdir -p _local
read -rsp "URL do Supabase (Session pooler): " SUPA_URL; echo
[ -n "$SUPA_URL" ] || { echo "URL vazia."; exit 1; }

echo "→ Gerando o dump (public, auth e conexao_private)…"
docker run --rm -e SUPA_URL="$SUPA_URL" -v "$(pwd -W 2>/dev/null || pwd)/_local:/out" postgres:17-alpine \
  sh -c 'pg_dump "$SUPA_URL" -Fc --no-owner --no-privileges -n public -n auth -n conexao_private -f /out/supabase.dump'
unset SUPA_URL

ls -la _local/supabase.dump
echo "✓ Dump salvo em _local/supabase.dump (tem dado pessoal: não compartilhe nem commite)."
