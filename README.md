# AXE CAPITAL — Escritório de Trading Forex Autônomo

Uma aplicação web que **não parece um dashboard**: você abre o navegador e vê uma
**mesa institucional de operações viva** em 3D — pessoas trabalhando, monitores
com gráficos, oportunidades sendo analisadas em cadeia, risco vetando trades e o
trader executando ordens.

> ⚠️ **Versão 1 = SIMULAÇÃO.** Nenhum dinheiro real é movimentado por padrão.
> A execução real só acontece se você, explicitamente, trocar o roteamento para
> **MT5 LIVE** com a ponte do MetaTrader 5 rodando.

---

## 1. Como rodar

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

## 4. MetaTrader 5 (conta já logada)

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

No app: **⚙ Setup → MetaTrader 5**. Quando a ponte responde, o seletor de ativos
da tela **“+ Hire agent”** passa a listar os símbolos reais da sua conta
(inclusive sufixos do broker, como `EURUSD.m`) — você só escolhe quais quer operar.
Em **Execution routing** você decide entre *Paper desk* (simulação) e *Send to MT5*.

Quando a ponte está online, as cotações reais do terminal são sincronizadas
continuamente com o motor de preços (`syncReal`), então os gráficos das telas
acompanham o mercado de verdade mesmo antes de qualquer execução.

---

## 5. IA dos agentes (LM Studio / provider personalizado)

**⚙ Setup → AI provider**:

* presets `lmstudio` (`http://127.0.0.1:1234/v1`), `ollama`, `openai` e **`custom`**;
* campos livres de Base URL, API key, modelo, temperatura e max tokens;
* botões **List models** e **Test prompt** para validar a conexão;
* ative por agente em *Agent inspector → “Use local LLM for this agent”*.

O modelo recebe o contexto da oportunidade (par, lado, spread, regime, momentum,
scores anteriores, próximo evento macro) e responde em JSON
(`{"score":0-100,"bias":"BULLISH|BEARISH|NEUTRAL","comment":"..."}`).
A chamada é **fire-and-forget**: se o modelo estiver lento ou offline, a mesa
continua operando com as heurísticas determinísticas — nada trava.

---

## 6. Eventos do pipeline

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

## 7. Próximos passos sugeridos

1. Estratégias plugáveis por agente (`Strategy` já é uma interface) + backtesting.
2. Persistência do journal (SQLite) e relatórios por agente.
3. Dados reais de candles do MT5 alimentando diretamente os indicadores.
4. Trailing stop / parcial / breakeven no `ExecutionEngine`.
5. Vozes e legendas dos agentes, salas de reunião, tour cinematográfico automático.
