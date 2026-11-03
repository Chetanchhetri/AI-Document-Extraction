from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, require_super_admin
from app.core.database import get_session
from app.core.security import issue_otp, revoke_all_user_tokens
from app.models import Role, User
from app.schemas.user import UserAdminUpdate, UserCreate, UserRead, UserSelfUpdate
from app.services import mail_service
from app.services.user_service import create_user, get_user_by_email

router = APIRouter(prefix="/users", tags=["users"])


# ------------------------------------------------------------------
# 1. LIST USERS (SUPER ADMIN)
# ------------------------------------------------------------------
@router.get("", response_model=list[UserRead])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session)
):
    return (await session.exec(select(User).order_by(User.id).offset(skip).limit(limit))).all()


# ------------------------------------------------------------------
# 2. CREATE STAFF USER (SUPER ADMIN)
# ------------------------------------------------------------------
@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_staff_user(
    body: UserCreate,
    bg: BackgroundTasks,
    _admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session)
):
    if await get_user_by_email(session, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    try:
        user = await create_user(
            session,
            email=body.email,
            password=body.password,
            full_name=body.full_name,
            role=body.role,
            verified=False
        )
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
        
    code = await issue_otp(user.email)
    bg.add_task(mail_service.send_otp_email, user.email, user.full_name, code)
    return user


# ------------------------------------------------------------------
# 3. GET CURRENT USER PROFILE (GET /me) -> ADDED THIS FIX
# ------------------------------------------------------------------
@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)):
    """
    Returns profile details of the currently authenticated user.
    """
    return current_user


# ------------------------------------------------------------------
# 4. UPDATE CURRENT USER PROFILE (PATCH /me)
# ------------------------------------------------------------------
@router.patch("/me", response_model=UserRead)
async def update_me(
    body: UserSelfUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    user.full_name = body.full_name  # DTO has no role/is_active -> cannot be mass-assigned
    session.add(user)
    await session.commit()
    return user


# ------------------------------------------------------------------
# 5. ADMIN UPDATE USER (PATCH /{user_id})
# ------------------------------------------------------------------
@router.patch("/{user_id}", response_model=UserRead)
async def admin_update_user(
    user_id: int,
    body: UserAdminUpdate,
    admin: User = Depends(require_super_admin),
    session: AsyncSession = Depends(get_session)
):
    target = await session.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found")
        
    if target.id == admin.id and (
        (body.role is not None and body.role != Role.super_admin) or body.is_active is False
    ):
        raise HTTPException(400, "You cannot demote or deactivate your own account")
        
    revoke = False
    if body.full_name is not None:
        target.full_name = body.full_name
    if body.role is not None and body.role != target.role:
        target.role, revoke = body.role, True
    if body.is_active is not None and body.is_active != target.is_active:
        target.is_active, revoke = body.is_active, True
        
    session.add(target)
    await session.commit()
    
    if revoke:
        await revoke_all_user_tokens(target.id)  # force re-login with the new privileges
        
    return target