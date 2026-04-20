from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

connections = {}

@router.websocket("/ws/po/{po_id}")
async def websocket_endpoint(websocket: WebSocket, po_id: str):
    await websocket.accept()
    connections.setdefault(po_id, []).append(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connections[po_id].remove(websocket)

async def push_update(po_id: str, data: dict):
    for ws in connections.get(po_id, []):
        await ws.send_json(data)
