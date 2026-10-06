# AXE CAPITAL — Escritório de Trading Forex Autônomo

Uma aplicação web que **não parece um dashboard**: você abre o navegador e vê uma
**mesa institucional de operações viva** em 3D — pessoas trabalhando, monitores
com gráficos, oportunidades sendo analisadas em cadeia, risco vetando trades e o
trader executando ordens.

> ⚠️ **Versão 1 = SIMULAÇÃO.** Nenhum dinheiro real é movimentado por padrão.
> A execução real só acontece se você, explicitamente, trocar o roteamento para
> **MT5 LIVE** com a ponte do MetaTrader 5 rodando.

---

## 0. Instalação em 1 comando (Windows)

Abra o **PowerShell** (ou CMD) e cole:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/arena/8d46e70a-axecapital/scripts/install.ps1 | iex"
```

> Pode rodar **de qualquer pasta** — o script não usa o diretório atual. Ele instala em
> `%USERPROFILE%\AxeCapital` (ex.: `C:\Users\Murilo\AxeCapital`). Para escolher outro lugar:
> `iex "& { $(irm <url>) } -InstallDir 'D:\Axe'"`.

Versão curta, já dentro do PowerShell:

```powershell
irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/arena/8d46e70a-axecapital/scripts/install.ps1 | iex
```

O instalador puxa **somente a branch `arena/8d46e70a-axecapital`** (nada de merge na `main`) e:

1. instala Git, Node.js LTS e Python via `winget` se faltarem;
2. clona a branch em `%USERPROFILE%\AxeCapital`;
3. instala as dependências do engine e da interface e compila tudo;
4. instala os requisitos da ponte MetaTrader 5;
5. cria os atalhos **“Axe Capital”** (área de trabalho), `Start-AxeCapital.cmd` e `Update-AxeCapital.cmd`;
6. sobe a ponte MT5 (se houver Python), o engine em `http://localhost:8787` e abre o navegador.

### O mesmo comando também ATUALIZA

Rode o comando de novo (ou o `Update-AxeCapital.cmd`) e ele:

* consulta a branch e compara com o que está instalado — se não houver novidade, avisa
  `já está na última versão` e não refaz nada;
* se houver, mostra `abc1234 → def5678`, baixa só o delta (`git reset --hard FETCH_HEAD`)
  e **reinstala/recompila apenas o que mudou** (deps só se o `package-lock` mudou);
* **mantém todas as suas configurações**: `data\config.json` (provider de IA, URL da ponte,
  roteamento de execução, watchlist e os agentes contratados) e `.env` são ignorados pelo git,
  nunca são sobrescritos — e ainda ganham uma cópia carimbada em `data\backups\` antes do update.

Flags úteis: `-CheckOnly` (só verifica se há atualização), `-Force` (recompila tudo),
`-SkipBridge`, `-NoLaunch`.

Parâmetros opcionais (ex.: outra pasta, sem abrir no fim):

```powershell
$s = irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/arena/8d46e70a-axecapital/scripts/install.ps1
iex "& { $s } -InstallDir 'D:\Axe' -SkipBridge -NoLaunch"
```

Depois da instalação, o `Start-AxeCapital.cmd` (ou `scripts\start.ps1 -Dev`) é o único comando necessário para abrir o escritório.

### Erro “npm.ps1 não está assinado digitalmente”

Em máquinas com `ExecutionPolicy` = `AllSigned`/`Restricted` o PowerShell recusa carregar o
`npm.ps1` que acompanha o Node.js. O instalador já contorna isso de duas formas:

* libera `Bypass` **apenas para o processo atual** (`Set-ExecutionPolicy -Scope Process`) — nada
  é alterado permanentemente na máquina;
* e, mesmo assim, chama o npm sempre por `cmd.exe /c npm …` (usa `npm.cmd`, que não passa por
  política de execução).

Se mesmo assim a política da empresa bloquear o próprio script, use a forma longa:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/muriloramosoficial/axecapital/refs/heads/arena/8d46e70a-axecapital/scripts/install.ps1 | iex"
```

---

## 1. Como rodar (manual / Linux / macOS)

```bash
# 1. dependências
npm run install:all

# 2. engine (Node) + interface (Vite) juntos
npm run dev
#   engine  → http://localhost:8787
#   escritório → http://localhost:5173
```

Opcional (Windows, junto do terminal MT5):

```bash
cd mt5-bridge
pip install -r requirements.txt
python bridge.py          # http://127.0.0.1:8788
```

Produção em um único processo:

```bash
npm run build && npm start   # o engine serve o frontend compilado
```

---

## 2. O que já está implementado

| Bloco | Status |
|---|---|
| Escritório 3D em Three.js (chão refletivo, paredes, janelas com cidade, iluminação vinda dos monitores, bloom cinematográfico) | ✅ |
| 17 estações de trabalho com mesas, cadeiras, teclados, mouses, canecas, telefones, papéis, 2–6 monitores cada | ✅ |
| Agentes humanos animados (digitar, telefone, escrever, café, apontar, alongar, conversar) com aparência própria | ✅ |
| Setores: Market Intelligence, Research, News Room, Risk & Portfolio, Execution | ✅ |
| Painel central **MARKET INTELLIGENCE** com videowall + **widget oficial da TradingView** (Advanced Chart) | ✅ |
| Monitores com mini-dashboards vivos (candles, bid/ask, spread, volume, volatilidade, book, risco, calendário, terminal quant) | ✅ |
| Motor de mercado simulado (ticks, candles, spreads, regimes, choques, notícias) | ✅ |
| Event bus + pipeline Scout → Technical → Macro → Quant → Risk → Portfolio → Trader → Execution | ✅ |
| Risk Manager com poder de veto (exposição, correlação, evento macro próximo, volatilidade, drawdown) | ✅ |
| **Uma entrada por ativo/agente**: enquanto a posição está aberta, o dono acompanha em tempo real e não abre outra | ✅ |
| **Resultado diário por agente exibido na própria mesa** (P&L aberto ao vivo + realizado do dia, W/L) | ✅ |
| Journal de trades, posições abertas, HUD de conta, P&L, win rate, exposição | ✅ |
| Comunicação entre agentes (chat da mesa em tempo real) | ✅ |
| Câmera cinematográfica que segue a oportunidade de mesa em mesa + órbita/zoom/pan manual | ✅ |
| Controles: start/pause, velocidade 1x…100x, troca de regime, novo evento de mercado, reset do dia | ✅ |
| **Contratar agente**: escolhe função, ativo (lido da conta MT5), mesa, agressividade, risco máximo e se usa IA | ✅ |
| Conexão MetaTrader 5 **pela conta já logada** (sem pedir login/senha), lista de ativos da conta, execução e fechamento de posições | ✅ |
| Provider de IA local (LM Studio) + Ollama + OpenAI + **provider personalizado** (qualquer endpoint compatível com OpenAI) | ✅ |

---

## 3. Arquitetura

```
/backend                     Node + TypeScript (engine, sem nenhuma UI)
  src/core/                  types.ts · event-bus.ts
  src/market/                interfaces.ts (MarketDataProvider)
                             SimulatedMarketDataProvider.ts
  src/broker/                interfaces.ts (TradingBroker)
                             SimulatedBroker.ts · MT5Broker.ts
  src/engines/               strategy-engine.ts (Strategy, indicadores)
                             risk-engine.ts    (veto determinístico e auditável)
                             news-engine.ts    (calendário econômico)
                             simulation-engine.ts (orquestrador + pipeline)
  src/agents/                registry.ts · office-layout.ts (planta do andar)
  src/ai/provider.ts         cliente OpenAI-compatible (LM Studio/custom)
  src/mt5/client.ts          cliente HTTP da ponte MT5
  src/server.ts              REST + WebSocket

/frontend                    React + TS + Vite + Tailwind + Three.js (r3f)
  src/three/                 Scene · Office · Desk3D · Agent3D · screens (canvas
                             textures dos monitores) · TradingViewScreen
  src/ui/                    TopHUD · ControlBar · PipelinePanel · CommsFeed ·
                             TradeJournal · SidePanels · HireAgentModal ·
                             SettingsModal
  src/state/store.ts         zustand + WebSocket

/mt5-bridge/bridge.py        FastAPI ao lado do terminal MetaTrader 5
```

**Regra de ouro respeitada:** a lógica financeira vive apenas no `/backend`.
O frontend só recebe eventos e desenha. Trocar o motor por dados reais não exige
tocar em nada da camada visual.

### Interfaces preparadas para o futuro

```ts
interface MarketDataProvider { listSymbols(); getPrice(symbol); getCandles(symbol); subscribe(symbol); }
interface TradingBroker      { getAccount(); placeOrder(order); closePosition(id); getPositions(); }
interface Strategy           { analyze({ symbol, candles, regime }): Signal | null; }
```

Hoje: `SimulatedMarketDataProvider` + `SimulatedBroker`.
Já disponível: `MT5Broker` (execução real na conta logada).

---

## 4. “Não tenho MetaTrader 5 nesta máquina” — e agora?

**Nada muda para você: o escritório roda inteiro sem MT5.** A ponte é 100% opcional.

| Com MT5 + ponte | Sem MT5 (padrão) |
|---|---|
| Ativos: os da sua conta (inclusive `EURUSD.m`) | Ativos: universo simulado (28 instrumentos: majors, ouro, prata, petróleo, índices, DXY, US10Y, VIX, BTC) |
| Cotações: do terminal, sincronizadas no motor | Cotações: motor estocástico com regimes, choques e notícias |
| Execução: ordens reais na conta logada | Execução: paper desk interno, saldo fictício de $100.000 |
| HUD mostra `MT5 LIVE` | HUD mostra `SIMULATION` |

Continuam funcionando **exatamente igual**: escritório 3D, agentes, contratação, pipeline de análise,
Risk Manager, trade journal, notícias, câmera cinematográfica, widgets da TradingView, cérebro de
aprendizado e a IA local (LM Studio também é opcional — sem ela os agentes usam as heurísticas).

Detalhes práticos:

* o instalador avisa `sem Python: a ponte MT5 não será iniciada` e segue normalmente;
* o pacote `MetaTrader5` só existe no Windows — no `requirements.txt` ele já está marcado com
  `sys_platform == "win32"`, então em Linux/macOS a instalação não quebra;
* na primeira abertura aparece um aviso explicando o modo simulação, e em **⚙ Setup → MetaTrader 5**
  o botão *Send to MT5* fica desabilitado enquanto a ponte estiver offline (impossível mandar ordem sem querer);
* quando você instalar o MT5 depois, basta abrir o terminal logado, rodar `python mt5-bridge/bridge.py`
  e clicar em *Re-check terminal* — os ativos da conta aparecem na hora no “Hire agent”, sem reconfigurar nada.

---

## 5. MetaTrader 5 (conta já logada)

A ponte **nunca pede login, senha ou servidor**. Ela faz `mt5.initialize()`,
anexa ao terminal aberto e expõe:

| Endpoint | Função |
|---|---|
| `GET /status` | conta logada (login, servidor, saldo, alavancagem) |
| `GET /symbols` | **todos os ativos disponíveis para aquela conta** |
| `GET /tick/{symbol}` · `GET /ticks?symbols=` | cotações |
| `GET /candles/{symbol}` | histórico OHLC |
| `GET /positions` · `GET /history` | book e histórico |
| `POST /order` · `POST /close` | execução a mercado com SL/TP |

No app: **⚙ Setup → aba MetaTrader 5 → botão “🔌 Conectar MT5”**. Ele roda a verificação completa e
só libera o modo live quando tudo passa:

| Check | O que valida |
|---|---|
| Ponte local respondendo | `bridge.py` acessível na URL configurada |
| Pacote MetaTrader5 | biblioteca instalada (Windows) |
| Terminal aberto | `mt5.initialize()` com o terminal rodando |
| Conta logada | login/servidor/corretora da conta ativa |
| AutoTrading habilitado | botão *Algo Trading* ligado no terminal |
| Instrumentos da conta | quantos símbolos foram encontrados |

Cada item aparece com ✓/✕ e a dica do que fazer; passando todos, a execução é roteada automaticamente
para o terminal (`MT5 LIVE` no HUD). O chip do HUD também abre essa aba com um clique, e *Paper desk*
volta tudo para a simulação. Quando a ponte responde, o seletor de ativos
da tela **“+ Hire agent”** passa a listar os símbolos reais da sua conta
(inclusive sufixos do broker, como `EURUSD.m`) — você só escolhe quais quer operar.
Em **Execution routing** você decide entre *Paper desk* (simulação) e *Send to MT5*.

Quando a ponte está online, as cotações reais do terminal são sincronizadas
continuamente com o motor de preços (`syncReal`), então os gráficos das telas
acompanham o mercado de verdade mesmo antes de qualquer execução.

---

## 6. IA dos agentes (LM Studio / provider personalizado)

Pelo HUD: o chip **🧠 provider · modelo** (ao lado do indicador de execução) abre direto a aba de IA.

**⚙ Setup → aba Provider de IA**:

* **dropdown de provider**: LM Studio (local), Ollama (local), OpenAI e **Provider personalizado** —
  trocar no dropdown já preenche Base URL/modelo padrão e mostra a dica de como subir cada um;
* campos livres de Base URL, API key, modelo, temperatura e max tokens;
* botões **List models** e **Test prompt** para validar a conexão;
* ajuste de temperatura e máx. tokens;
* **Ligar IA em todos** / **Só heurísticas** aplica a escolha à equipe inteira de uma vez;
* ou ative por agente em *Agent inspector → “Use local LLM for this agent”*.

O modelo recebe o contexto da oportunidade (par, lado, spread, regime, momentum,
scores anteriores, próximo evento macro) e responde em JSON
(`{"score":0-100,"bias":"BULLISH|BEARISH|NEUTRAL","comment":"..."}`).
A chamada é **fire-and-forget**: se o modelo estiver lento ou offline, a mesa
continua operando com as heurísticas determinísticas — nada trava.

---

## 7. Eventos do pipeline

`MARKET_MOVEMENT` → `OPPORTUNITY_DETECTED` → `TECHNICAL_ANALYSIS_STARTED/COMPLETED`
→ `MACRO_ANALYSIS_*` → `QUANT_ANALYSIS_*` → `RISK_REVIEW_STARTED`
→ `TRADE_APPROVED` | `TRADE_REJECTED` → `ORDER_SUBMITTED` → `ORDER_FILLED`
→ `POSITION_OPENED` → `TAKE_PROFIT_TRIGGERED` | `STOP_LOSS_TRIGGERED` → `POSITION_CLOSED`,
além de `NEWS_EVENT`, `NEWS_RELEASED`, `REGIME_CHANGED`, `AGENT_STATE`,
`AGENT_ACTIVITY`, `AGENT_SPEAK`, `AMBIENT` e `CAMERA_FOCUS`.

Estados dos agentes (cor + animação + anel na mesa):
`IDLE · SCANNING · ANALYZING · WAITING · ALERT · APPROVED · REJECTED · EXECUTING · SUCCESS · ERROR`.

Regimes de mercado: `TRENDING · RANGING · HIGH_VOLATILITY · LOW_VOLATILITY · NEWS_SHOCK · LIQUIDITY_DROP`.

---

## 8. Regra de uma entrada **simultânea** por agente

* Cada **Market Scout** é dono do seu instrumento. Ao detectar um setup, ele leva a ideia pelo pipeline e, se aprovada, **a posição fica no nome dele** (`position.agentId`).
* **Máximo de 1 posição aberta por vez, por agente.** Enquanto ela estiver viva ele não abre outra (`maybeScan` bloqueia por `agentId` e por `symbol`); assim que ela fecha, o slot é liberado e, depois de um respiro curto (~30–120s de tempo simulado), ele volta a caçar e pode operar quantas vezes quiser no dia.
* Durante a operação ele entra em estado `WAITING` e a mesa mostra, atualizando a cada ~1,2s:
  `● LIVE EURUSD +$42.80` (marcação a mercado do que ele está gerindo).
* Quando o SL/TP dispara, o engine credita o resultado no agente (`AgentRegistry.settle`) e a plaquinha da mesa passa a mostrar o **resultado total do dia**:
  `DAY +$1,379.40 · 3t`, em verde se positivo e vermelho se negativo — com `W/L` detalhado no *Agent inspector*.
* A câmera vai até a mesa dele no momento do fechamento e ele comenta o resultado no chat da mesa.
* **Reset day** zera os resultados diários de todos os agentes.

### Persistência local das suas configurações

Tudo que **você** configura é gravado em `data/config.json` (fora do git):
provider de IA (URL, modelo, chave, temperatura), URL da ponte MT5, roteamento de execução,
regime/velocidade, watchlist e **a equipe contratada** (função, ativo, mesa, agressividade,
risco máximo, uso de IA). Ao reabrir o app — ou depois de uma atualização — a mesa volta
exatamente como você deixou. Resultados simulados de P&L nunca são persistidos.

---

## 9. Cérebro de aprendizado de cada agente

Cada agente tem uma **memória própria e explicável** (`backend/src/agents/learning.ts`). Nada de caixa preta:
todo trade fechado vira uma **lição**.

**Como funciona**

1. **Decomposição do setup** — no momento da entrada o engine fotografa o contexto e o quebra em *features*
   discretas: `regime`, `side`, `volatility`, `momentum`, `liquidity`, `session` (asia/london/ny/late),
   `spread` (tight/normal/wide), `news` (clear/near/imminent), `aligned` (operou a favor do momentum?),
   faixas de `technical`, `macro`, `confidence` e `risk/reward`.
2. **Registro do resultado** — ao bater SL/TP o agente grava `pnl`, `R múltiplo`, tempo em posição e
   atualiza as estatísticas de **cada feature** (amostras, win rate, P&L, R médio).
3. **Post-mortem automático** — a lição guarda o que deu **certo (✓)** e **errado (✕)** em linguagem de mesa:
   *“✓ traded with the bearish momentum”, “✓ technical score 83/100”, “✕ spread 1.50x normal at entry”,
   “✕ volatility extreme”* + um veredito: *“Clean 2.6R — repeat this setup family.”*
4. **Uso na próxima decisão** — antes de abrir, o scout consulta a memória:
   * win rate suavizado (Laplace) e peso proporcional à amostra (confiança total a partir de 10 trades);
   * resultado: `delta` de **−20 a +20 pontos de confiança** e um veredito `TAKE / NEUTRAL / AVOID`;
   * `AVOID` forte (≥6 trades e ≤30% de acerto) faz o **scout nem abrir a ideia** (“Skipping this EURUSD setup —
     memory: event proximity = imminent is 22% over 9 trades”) e dá ao **Risk Manager** um motivo extra de veto
     (`learned pattern — …`);
   * `TAKE` soma confiança e aparece no painel de pipeline como **🧠 Agent memory +7 conf**.
5. **Calibração** — o cérebro compara a confiança prevista com o acerto real por faixa (ex.: `conf 70-79 → 64% real`),
   então o agente aprende também quando está otimista demais.

**Onde ver**: selecione um agente no escritório → *Agent inspector* → **🧠 Brain**. O modal mostra
lições, hit rate, expectancy em R, profit factor, **setups que funcionam**, **setups para evitar**,
calibração e o diário completo com ✓/✕ por trade. Dá para apagar a memória de um agente ali mesmo.

A memória é persistida em `data/memory.json`, com chave estável `ROLE|nome|ativo` — ou seja,
**sobrevive a reinícios e às atualizações do instalador**. `GET /api/brains` devolve o ranking
de todos os cérebros (amostras, win rate, expectancy, P&L aprendido).

---

## 10. Modo transmissão (live 24h no YouTube)

O escritório foi ajustado para ficar bonito numa captura de janela/navegador o dia inteiro:

* **iluminação diurna** — piso de concreto claro, paredes claras, janelas com luz natural e
  bloom suave; as telas continuam escuras e legíveis por contraste;
* **agentes em traje formal** — paletó com lapela, camisa, gravata, crachá, óculos/headset
  (trader e scout) e variações determinísticas por agente;
* **plaquinha de mesa clara** com nome, ativo, estado, operação aberta e resultado do dia.

### Esconder / mostrar a HUD

No canto superior direito existe uma barrinha sempre disponível com três modos:

| Modo | O que aparece | Para quê |
| --- | --- | --- |
| **Completo** `▦` | HUD, pipeline, news, inspector, comms, journal, barra de controles | operar e configurar |
| **Transmissão** `◉` | só a HUD de conta no topo + ticker de preços embaixo | live no YouTube |
| **Limpo** `⬚` | apenas o escritório 3D | cenas cinematográficas |

Atalhos de teclado: **H** alterna o modo · **[** e **]** diminuem/aumentam a escala da
interface (70%–140%, útil em 1080p/4K) · **F** entra e sai de tela cheia. O modo escolhido e a
escala ficam salvos no navegador (`axe.hudMode`, `axe.uiScale`), então um reinício do PC volta
com o mesmo enquadramento.

### Layout responsivo

As colunas laterais usam larguras fluidas (`clamp`), somem automaticamente em telas estreitas
(a da direita abaixo de 1280px, a da esquerda abaixo de 1024px), a HUD do topo rola na
horizontal quando falta espaço e o gráfico TradingView flutuante se adapta à viewport — nada
mais se sobrepõe em 1366×768, 1920×1080 ou 2560×1440.

---

## 11. Próximos passos sugeridos

1. Estratégias plugáveis por agente (`Strategy` já é uma interface) + backtesting sobre as lições gravadas.
2. Persistência do journal (SQLite) e relatórios por agente.
3. Dados reais de candles do MT5 alimentando diretamente os indicadores.
4. Trailing stop / parcial / breakeven no `ExecutionEngine`.
5. Vozes e legendas dos agentes, salas de reunião, tour cinematográfico automático.
