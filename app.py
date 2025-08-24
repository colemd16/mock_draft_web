# app.py
from flask import Flask, request, jsonify, send_from_directory
from draft_engine import DraftGame
import os

app = Flask(__name__, static_folder="static")
GAME = DraftGame(players_csv=os.path.join("data", "players5.csv"))
LAST_SLOT = 4


def error(message, code=400):
    return jsonify({"ok": False, "error": message}), code


@app.post("/api/start")
def start():
    data = request.get_json(silent=True) or {}
    try:
        slot = int(data.get("slot", 4))
    except (TypeError, ValueError):
        return error("slot must be an integer between 1 and 12")

    if not (1 <= slot <= 12):
        return error("slot must be between 1 and 12")

    global LAST_SLOT
    LAST_SLOT = slot
    GAME.reset(slot=slot, teams=12, rounds=20)
    GAME.advance_to_user_turn()
    state = GAME.state()
    state["ok"] = True
    return jsonify(state)


@app.post("/api/restart")
def restart():
    global LAST_SLOT
    data = request.get_json(silent=True) or {}
    slot_val = data.get("slot")
    try:
        slot = int(slot_val) if slot_val is not None else int(LAST_SLOT)
    except (TypeError, ValueError):
        return error("slot must be an integer between 1 and 12")
    if not (1 <= slot <= 12):
        return error("slot must be between 1 and 12")

    # remember it and reset
    LAST_SLOT = slot
    GAME.reset(slot=slot, teams=12, rounds=20)
    GAME.advance_to_user_turn()
    state = GAME.state()
    state["ok"] = True
    return jsonify(state)


@app.post("/api/pick")
def pick():
    data = request.get_json(silent=True) or {}
    if "index" not in data:
        return error("index (0-based top-20 index) is required")
    try:
        player_index = int(data["index"])  # index in current top-20
    except (TypeError, ValueError):
        return error("index must be an integer")

    try:
        GAME.user_pick_by_index(player_index)
    except Exception as e:
        # Surface a readable error to the client (e.g., out-of-range index)
        return error(str(e))

    state = GAME.state()
    state["ok"] = True
    return jsonify(state)


@app.get("/api/state")
def state():
    s = GAME.state()
    s["ok"] = True
    return jsonify(s)


@app.get("/")
def root():
    return send_from_directory("static", "index.html")


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host=host, port=port)