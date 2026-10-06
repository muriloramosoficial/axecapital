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
        return {
            "connected": True,
            "account": as_dict(acc),
            "terminal": {
                k: v
                for k, v in as_dict(term).items()
                if k in {"name", "company", "path", "connected", "trade_allowed", "build"}
            },
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
    if not mt5.symbol_select(req.symbol, True):
        raise HTTPException(400, f"cannot select {req.symbol}")
    info = mt5.symbol_info(req.symbol)
    t = mt5.symbol_info_tick(req.symbol)
    if info is None or t is None:
        raise HTTPException(400, f"no market data for {req.symbol}")

    is_buy = req.side.upper() == "BUY"
    volume = max(info.volume_min, min(info.volume_max, round(req.volume / info.volume_step) * info.volume_step))
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": req.symbol,
        "volume": float(round(volume, 2)),
        "type": mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL,
        "price": t.ask if is_buy else t.bid,
        "deviation": req.deviation,
        "magic": req.magic,
        "comment": req.comment[:28],
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    if req.sl:
        request["sl"] = float(req.sl)
    if req.tp:
        request["tp"] = float(req.tp)

    result = mt5.order_send(request)
    if result is None:
        raise HTTPException(502, f"order_send failed: {mt5.last_error()}")
    payload = as_dict(result)
    payload["ok"] = result.retcode == mt5.TRADE_RETCODE_DONE
    return payload


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
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(request)
    if result is None:
        raise HTTPException(502, f"order_send failed: {mt5.last_error()}")
    payload = as_dict(result)
    payload["ok"] = result.retcode == mt5.TRADE_RETCODE_DONE
    return payload


if __name__ == "__main__":
    port = int(os.environ.get("MT5_BRIDGE_PORT", 8788))
    print(f"[axe-capital] MT5 bridge on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
