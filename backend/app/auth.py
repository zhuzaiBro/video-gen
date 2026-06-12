import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.utils import utc_now

security = HTTPBearer(auto_error=False)

_jwks_client: PyJWKClient | None = None
_jwks_url: str | None = None


def _resolve_supabase_url() -> str:
    return (settings.supabase_url or settings.vite_supabase_url).rstrip("/")


def _decode_supabase_token(token: str) -> dict:
    supabase_url = _resolve_supabase_url()
    if not supabase_url and not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase auth is not configured (set VITE_SUPABASE_URL)",
        )

    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    algorithm = header.get("alg", "HS256")

    if algorithm == "ES256":
        if not supabase_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="VITE_SUPABASE_URL is required for ES256 JWT verification",
            )
        global _jwks_client, _jwks_url
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        if _jwks_client is None or _jwks_url != jwks_url:
            _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
            _jwks_url = jwks_url
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=f"{supabase_url}/auth/v1",
        )

    if algorithm == "HS256" and settings.supabase_jwt_secret:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please login")

    try:
        payload = _decode_supabase_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    supabase_id = payload.get("sub")
    if not supabase_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    email = payload.get("email")
    name = payload.get("user_metadata", {}).get("full_name") or payload.get("user_metadata", {}).get("name")

    result = await db.execute(select(User).where(User.supabase_id == supabase_id))
    user = result.scalar_one_or_none()

    now = utc_now()
    if user is None:
        user = User(
            supabase_id=supabase_id,
            email=email,
            name=name,
            login_method="supabase",
            last_signed_in=now,
        )
        db.add(user)
    else:
        user.email = email or user.email
        user.name = name or user.name
        user.last_signed_in = now

    await db.commit()
    await db.refresh(user)
    return user
