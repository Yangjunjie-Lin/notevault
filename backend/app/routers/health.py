from fastapi import APIRouter


router = APIRouter(tags=["health"])


@router.get("/")
@router.get("/health")
def health_check():
    return {"ok": True, "service": "personal-notebook-api"}

