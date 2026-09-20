#!/usr/bin/env bash
# Concatena src/ en un único HTML autocontenido.
set -e
cd "$(dirname "$0")"
cat src/00_head.html src/10_core.js src/20_champs.js src/30_combat.js \
    src/40_ai.js src/50_match_ui.js src/60_loop.js > crisol-arena.html
printf '\n</script>\n</body>\n</html>\n' >> crisol-arena.html
echo "crisol-arena.html listo ($(du -h crisol-arena.html | cut -f1))"
