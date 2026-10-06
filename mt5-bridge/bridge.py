"""
Axe Capital — MetaTrader 5 bridge
=================================

Runs on the SAME Windows machine as your MetaTrader 5 terminal and exposes a
tiny local HTTP API that the Node engine consumes.

Design rules (as requested):
  * it NEVER asks for login/password/server — it attaches to the terminal that
    is already running and logged in (`mt5.initialize()`);
  * it discovers the instruments available to that account by itself;
  * the UI only chooses WHICH of those instruments the agents will trade.

Usage:
    pip install -r requirements.txt
    python bridge.py            # http://127.0.0.1:8788
"""

from __future__ import annotations

import datetime as dt
import os
import threading
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

try:  # the package only installs on Windows
    import MetaTrader5 as mt5
except Exception:  # pragma: no cover
    mt5 = None

LOCK = threading.Lock()
app = FastAPI(title="Axe Capital MT5 Bridge", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

TIMEFRAMES = {}
if mt5:
    TIMEFRAMES = {
        "M1": mt5.TIMEFRAME_M1,
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1,
    }


def ensure() -> None:
    """Attach to the already-running / already-logged-in terminal."""
    if mt5 is None:
        raise HTTPException(503, "MetaTrader5 python package not available (Windows only)")
    with LOCK:
        if mt5.terminal_info() is None:
            path = os.environ.get("MT5_TERMINAL_PATH")
            ok = mt5.initialize(path) if path else mt5.initialize()
            if not ok:
                raise HTTPException(503, f"mt5.initialize failed: {mt5.last_error()}")


def as_dict(obj: Any) -> dict:
    return obj._asdict() if hasattr(obj, "_asdict") else dict(obj)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "package": mt5 is not None}


@app.get("/status")
def status() -> dict:
    if mt5 is None:
        return {"connected": False, "error": "MetaTrader5 package not installed (Windows only)"}
    try:
        ensure()
        acc = mt5.account_info()
        term = mt5.terminal_info()
        if acc is None:
            return {"connected": False, "error": "no account logged in the terminal"}
        acc_d = as_dict(acc)
        term_d = as_dict(term) if term else {}
        return {
            "connected": True,
            "account": acc_d,
            "terminal": {
                k: v
                for k, v in term_d.items()
                if k in {"name", "company", "path", "connected", "trade_allowed", "build", "community_account"}
            },
            # flags que explicam 90% dos "a ordem nao vai pro MT5"
            "trade_allowed": bool(term_d.get("trade_allowed", False)),
            "terminal_connected": bool(term_d.get("connected", False)),
            "account_trade_allowed": bool(acc_d.get("trade_allowed", False)),
            "account_trade_expert": bool(acc_d.get("trade_expert", False)),
        }
    except HTTPException as exc:
        return {"connected": False, "error": exc.detail}
    except Exception as exc:  # pragma: no cover
        return {"connected": False, "error": str(exc)}


@app.get("/symbols")
def symbols(only_watchlist: bool = Query(False)) -> dict:
    """Instruments available to the logged-in account."""
    ensure()
    raw = mt5.symbols_get()
    out = []
    for s in raw or []:
        if only_watchlist and not s.visible:
            continue
        out.append(
            {
                "name": s.name,
                "description": s.description,
                "path": s.path,
                "digits": s.digits,
                "point": s.point,
                "spread": s.spread,
                "trade_mode": s.trade_mode,
                "trade_contract_size": s.trade_contract_size,
                "volume_min": s.volume_min,
                "volume_max": s.volume_max,
                "volume_step": s.volume_step,
                "visible": s.visible,
            }
        )
    out.sort(key=lambda x: (not x["visible"], x["name"]))
    return {"count": len(out), "symbols": out}


@app.get("/tick/{symbol}")
def tick(symbol: str) -> dict:
    ensure()
    mt5.symbol_select(symbol, True)
    t = mt5.symbol_info_tick(symbol)
    info = mt5.symbol_info(symbol)
    if t is None or info is None:
        raise HTTPException(404, f"no tick for {symbol}")
    return {
        "symbol": symbol,
        "bid": t.bid,
        "ask": t.ask,
        "last": t.last,
        "volume": t.volume,
        "digits": info.digits,
        "spread": round(t.ask - t.bid, info.digits + 1),
        "time": t.time,
    }


@app.get("/ticks")
def ticks(symbols: str) -> dict:
    ensure()
    out = []
    for sym in [s for s in symbols.split(",") if s]:
        try:
            out.append(tick(sym))
        except HTTPException:
            continue
    return {"ticks": out}


@app.get("/candles/{symbol}")
def candles(symbol: str, timeframe: str = "M1", count: int = 200) -> dict:
    ensure()
    tf = TIMEFRAMES.get(timeframe.upper(), mt5.TIMEFRAME_M1)
    mt5.symbol_select(symbol, True)
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, min(count, 2000))
    if rates is None:
        raise HTTPException(404, f"no candles for {symbol}")
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "candles": [
            {
                "t": int(r["time"]) * 1000,
                "o": float(r["open"]),
                "h": float(r["high"]),
                "l": float(r["low"]),
                "c": float(r["close"]),
                "v": int(r["tick_volume"]),
            }
            for r in rates
        ],
    }


@app.get("/positions")
def positions() -> dict:
    ensure()
    pos = mt5.positions_get() or []
    return {"positions": [as_dict(p) for p in pos]}


@app.get("/history")
def history(days: int = 1) -> dict:
    ensure()
    to = dt.datetime.now()
    frm = to - dt.timedelta(days=days)
    deals = mt5.history_deals_get(frm, to) or []
    return {"deals": [as_dict(d) for d in deals]}


class OrderRequest(BaseModel):
    symbol: str
    side: str  # BUY | SELL
    volume: float
    sl: Optional[float] = None
    tp: Optional[float] = None
    deviation: int = 20
    comment: str = "AxeCapital"
    magic: int = 884210


@app.post("/order")
def order(req: OrderRequest) -> dict:
    ensure()
    _guard_trading()
    if not mt5.symbol_select(req.symbol, True):
        raise HTTPException(400, f"nao consegui selecionar {req.symbol} no Market Watch")
    info = mt5.symbol_info(req.symbol)
    t = mt5.symbol_info_tick(req.symbol)
    if info is None or t is None:
        raise HTTPException(400, f"sem cotacao para {req.symbol}")
    if info.trade_mode != mt5.SYMBOL_TRADE_MODE_FULL:
        raise HTTPException(409, f"{req.symbol} nao aceita ordens agora (trade_mode={info.trade_mode})")

    is_buy = req.side.upper() == "BUY"
    price = round(t.ask if is_buy else t.bid, info.digits)
    sl, tp = _clamp_stops(info, is_buy, price, req.sl, req.tp)
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": req.symbol,
        "volume": _norm_volume(info, req.volume),
        "type": mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
        "price": price,
        "deviation": req.deviation,
        "magic": req.magic,
        "comment": req.comment[:28],
        "type_time": mt5.ORDER_TIME_GTC,
    }
    if sl:
        request["sl"] = sl
    if tp:
        request["tp"] = tp

    out = _send(request, info)
    out["request"] = {k: v for k, v in request.items() if k != "action"}
    return out


# ───────────────────────────────────────────── helpers de execucao ──
def _norm_volume(info, volume: float) -> float:
    """Arredonda o volume para o passo do simbolo e respeita min/max."""
    step = info.volume_step or 0.01
    v = round(round(volume / step) * step, 8)
    v = max(info.volume_min, min(info.volume_max, v))
    return float(round(v, 2))


def _filling_modes(info) -> list:
    """Modos de preenchimento aceitos pelo simbolo, do mais provavel ao resto.

    Rejeicao 10030 (Unsupported filling mode) e um dos motivos mais comuns de
    a ordem nao entrar: cada corretora aceita um conjunto diferente.
    """
    out = []
    mask = getattr(info, "filling_mode", 0) or 0
    if mask & 1:  # SYMBOL_FILLING_FOK
        out.append(mt5.ORDER_FILLING_FOK)
    if mask & 2:  # SYMBOL_FILLING_IOC
        out.append(mt5.ORDER_FILLING_IOC)
    for m in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN):
        if m not in out:
            out.append(m)
    return out


def _clamp_stops(info, is_buy: bool, price: float, sl, tp):
    """Afasta SL/TP para a distancia minima exigida (evita retcode 10016)."""
    point = info.point or 0.00001
    min_dist = (getattr(info, "trade_stops_level", 0) or 0) * point
    digits = info.digits
    if min_dist <= 0:
        min_dist = 0
    if sl:
        sl = float(sl)
        if is_buy:
            sl = min(sl, price - min_dist)
        else:
            sl = max(sl, price + min_dist)
        sl = round(sl, digits)
    if tp:
        tp = float(tp)
        if is_buy:
            tp = max(tp, price + min_dist)
        else:
            tp = min(tp, price - min_dist)
        tp = round(tp, digits)
    return sl, tp


def _guard_trading() -> None:
    """Falha cedo e com mensagem clara quando o terminal nao deixa operar."""
    term = mt5.terminal_info()
    acc = mt5.account_info()
    if term is None:
        raise HTTPException(503, "terminal MetaTrader 5 nao esta acessivel")
    if not term.trade_allowed:
        raise HTTPException(
            409,
            "AutoTrading desligado no terminal: clique no botao 'Algo Trading' (Ctrl+E) do MetaTrader 5",
        )
    if acc is None:
        raise HTTPException(409, "nenhuma conta logada no terminal")
    if not getattr(acc, "trade_allowed", True):
        raise HTTPException(409, "a conta logada esta com trading desabilitado pelo servidor/corretora")
    if not getattr(acc, "trade_expert", True):
        raise HTTPException(409, "o servidor da corretora nao permite trading automatico (expert) nesta conta")


def _send(request: dict, info) -> dict:
    """order_send com fallback de filling mode e 1 retry em requote."""
    attempts = []
    for fill in _filling_modes(info):
        req = dict(request)
        req["type_filling"] = fill
        result = mt5.order_send(req)
        if result is None:
            attempts.append({"filling": int(fill), "retcode": None, "comment": f"order_send retornou None: {mt5.last_error()}"})
            continue
        payload = as_dict(result)
        payload["ok"] = result.retcode == mt5.TRADE_RETCODE_DONE
        payload["filling_used"] = int(fill)
        payload["attempts"] = attempts
        if payload["ok"]:
            return payload
        attempts.append({"filling": int(fill), "retcode": result.retcode, "comment": result.comment})
        # 10030 = filling nao suportado -> tenta o proximo modo
        if result.retcode != 10030:
            payload["attempts"] = attempts
            return payload
    raise HTTPException(502, f"order_send falhou em todos os modos de preenchimento: {attempts}")


@app.get("/diagnose")
def diagnose(symbol: str = "EURUSD", volume: float = 0.01) -> dict:
    """Checklist completo: por que a ordem entra (ou nao) neste terminal."""
    checks = []

    def add(cid, label, ok, detail):
        checks.append({"id": cid, "label": label, "ok": bool(ok), "detail": str(detail)})

    if mt5 is None:
        add("package", "Pacote MetaTrader5 instalado", False, "pip install MetaTrader5 (somente Windows)")
        return {"ok": False, "checks": checks}
    add("package", "Pacote MetaTrader5 instalado", True, "ok")

    try:
        ensure()
    except HTTPException as exc:
        add("terminal", "Terminal aberto e acessivel", False, exc.detail)
        return {"ok": False, "checks": checks}

    term = mt5.terminal_info()
    acc = mt5.account_info()
    add("terminal", "Terminal aberto e acessivel", term is not None, getattr(term, "name", "-"))
    add("server", "Terminal conectado ao servidor", bool(getattr(term, "connected", False)), "ligado" if getattr(term, "connected", False) else "sem conexao com a corretora")
    add("autotrading", "AutoTrading (Algo Trading) ligado", bool(getattr(term, "trade_allowed", False)), "ok" if getattr(term, "trade_allowed", False) else "clique em 'Algo Trading' no terminal (Ctrl+E)")
    add("account", "Conta logada", acc is not None, f"{getattr(acc, 'login', '-')} / {getattr(acc, 'server', '-')}")
    add("account_trade", "Conta com trading liberado", bool(getattr(acc, "trade_allowed", False)), "ok" if getattr(acc, "trade_allowed", False) else "conta investor/read-only ou bloqueada pela corretora")
    add("expert", "Corretora permite EA (trade_expert)", bool(getattr(acc, "trade_expert", False)), "ok" if getattr(acc, "trade_expert", False) else "servidor bloqueia trading automatico")

    info = None
    if mt5.symbol_select(symbol, True):
        info = mt5.symbol_info(symbol)
    add("symbol", f"Simbolo {symbol} no Market Watch", info is not None, getattr(info, "path", "nao encontrado"))
    if info is not None:
        add("tradable", f"{symbol} aceita ordens", info.trade_mode == mt5.SYMBOL_TRADE_MODE_FULL, f"trade_mode={info.trade_mode} (4 = full)")
        add("volume", "Volume minimo", True, f"min {info.volume_min} / passo {info.volume_step} / max {info.volume_max}")
        add("stops", "Distancia minima de stops", True, f"{getattr(info, 'trade_stops_level', 0)} points")
        t = mt5.symbol_info_tick(symbol)
        add("tick", "Cotacao chegando", t is not None and t.ask > 0, f"bid {getattr(t, 'bid', 0)} / ask {getattr(t, 'ask', 0)}")
        # check_order: o proprio MT5 diz se aceitaria a ordem, sem enviar nada
        if t is not None and acc is not None:
            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": _norm_volume(info, volume),
                "type": mt5.ORDER_TYPE_BUY,
                "price": t.ask,
                "deviation": 20,
                "magic": 884210,
                "comment": "AxeCapital check",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": _filling_modes(info)[0],
            }
            chk = mt5.order_check(req)
            if chk is None:
                add("order_check", "Simulacao da ordem (order_check)", False, f"{mt5.last_error()}")
            else:
                add("order_check", "Simulacao da ordem (order_check)", chk.retcode == 0, f"retcode {chk.retcode} - {chk.comment} - margem necessaria {chk.margin}")
    add("margin", "Margem livre", bool(acc) and acc.margin_free > 0, f"{getattr(acc, 'margin_free', 0)} {getattr(acc, 'currency', '')}")

    return {"ok": all(c["ok"] for c in checks), "checks": checks}


@app.post("/test-order")
def test_order(req: OrderRequest) -> dict:
    """Envia uma ordem real de volume minimo e (opcionalmente) fecha na hora."""
    ensure()
    _guard_trading()
    if not mt5.symbol_select(req.symbol, True):
        raise HTTPException(400, f"nao consegui selecionar {req.symbol} no Market Watch")
    info = mt5.symbol_info(req.symbol)
    t = mt5.symbol_info_tick(req.symbol)
    if info is None or t is None:
        raise HTTPException(400, f"sem cotacao para {req.symbol}")
    is_buy = req.side.upper() == "BUY"
    price = t.ask if is_buy else t.bid
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": req.symbol,
        "volume": _norm_volume(info, info.volume_min),
        "type": mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
        "price": round(price, info.digits),
        "deviation": req.deviation,
        "magic": req.magic,
        "comment": "AxeCapital test",
        "type_time": mt5.ORDER_TIME_GTC,
    }
    out = _send(request, info)
    out["request"] = {k: v for k, v in request.items() if k != "action"}
    return out


class CloseRequest(BaseModel):
    ticket: int
    deviation: int = 20


@app.post("/close")
def close(req: CloseRequest) -> dict:
    ensure()
    pos = mt5.positions_get(ticket=req.ticket)
    if not pos:
        raise HTTPException(404, "position not found")
    p = pos[0]
    t = mt5.symbol_info_tick(p.symbol)
    is_buy = p.type == mt5.POSITION_TYPE_BUY
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "position": p.ticket,
        "symbol": p.symbol,
        "volume": p.volume,
        "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
        "price": t.bid if is_buy else t.ask,
        "deviation": req.deviation,
        "magic": p.magic,
        "comment": "AxeCapital close",
        "type_time": mt5.ORDER_TIME_GTC,
    }
    return _send(request, mt5.symbol_info(p.symbol))


if __name__ == "__main__":
    port = int(os.environ.get("MT5_BRIDGE_PORT", 8788))
    print(f"[axe-capital] MT5 bridge on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
