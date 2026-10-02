#!/bin/sh
# Installs the JDO Claude Code mods into ~/.claude/mods (the copy every session
# loads) and prints the CLAUDE_CODE_PLUGIN_DIRS value for ~/.claude/settings.json.
# The repo is the source of truth; a branch switch never unloads an installed mod.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
dest="$HOME/.claude/mods"
mkdir -p "$dest"
dirs=""
for m in "$here"/*/; do
  m="${m%/}"; name="${m##*/}"
  [ -f "$m/.claude-plugin/plugin.json" ] || continue
  rsync -a --delete --exclude '.claude-plugin/types' --exclude 'tsconfig.json' "$m/" "$dest/$name/"
  echo "installed $name -> $dest/$name"
  dirs="${dirs:+$dirs:}~/.claude/mods/$name"
done
echo
echo "settings.json env: \"CLAUDE_CODE_PLUGIN_DIRS\": \"$dirs\""
