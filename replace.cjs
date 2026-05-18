const fs = require('fs');
let file = fs.readFileSync('components/BattleArena.tsx', 'utf8');
file = file.replace(/<img src={battle.backgroundSrc}/g, '<AsyncImage src={battle.backgroundSrc}');
file = file.replace(/<img\\s*\\n*\\s*src={activeHitter.battleHitSrc}/g, '<AsyncImage src={activeHitter.battleHitSrc}');
file = file.replace(/<img\\s*\\n*\\s*src={activeHitter.battleIdleSrc/g, '<AsyncImage src={activeHitter.battleIdleSrc');
fs.writeFileSync('components/BattleArena.tsx', file);
