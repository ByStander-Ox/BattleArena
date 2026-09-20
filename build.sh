#!/usr/bin/env bash
# Concatena src/ en un único HTML autocontenido.
# El orden importa: 10-57 son la simulación y la red, 60-80 la vista, 90 el bucle.
set -e
cd "$(dirname "$0")"
cat src/00_head.html \
    src/10_core.js src/20_champs.js src/30_combat.js src/40_ai.js src/50_match.js \
    src/55_net.js src/56_server.js src/57_client.js \
    src/60_view.js src/70_fx.js src/80_ui.js \
    src/90_loop.js > crisol-arena.html
printf '\n</script>\n</body>\n</html>\n' >> crisol-arena.html
echo "crisol-arena.html listo ($(du -h crisol-arena.html | cut -f1))"
