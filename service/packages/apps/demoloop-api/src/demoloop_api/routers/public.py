from demoloop_core.sharing import receipt_for, resolve
from demoloop_core.storage import presign_get
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/watch/{token}")
async def watch(token: str) -> dict:
    found = await resolve(token)
    if found is None:
        raise HTTPException(status_code=404, detail="no shared demo at that link")
    return {
        "video": presign_get(found["video_key"]) if found["video_key"] else None,
        "receipt": receipt_for(found),
    }
