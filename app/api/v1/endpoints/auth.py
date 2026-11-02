from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_access_claims, get_current_user, rate_limit
from app.core.database import get_session
from app.core.security import (TokenError, blacklist_token, decode_token, issue_otp, issue_token_pair,
                               revoke_family, rotate_refresh_token, verify_otp, verify_password)
from app.models import Role, User
from app.schemas.auth import (LoginRequest, LogoutRequest, MessageResponse, RefreshRequest, ResendOtpRequest,
                              SignupRequest, TokenResponse, VerifyOtpRequest)
from app.schemas.user import UserRead
from app.services import mail_service
from app.services.user_service import create_user, get_user_by_email

router = APIRouter(prefix="/auth", tags=["auth"])
GENERIC_SENT = MessageResponse(message="If the address can be used, a verification code has been sent.")


@router.post("/signup", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(rate_limit("signup"))])
async def signup(body: SignupRequest, bg: BackgroundTasks, session: AsyncSession = Depends(get_session)):
    """Self-registration. Role is ALWAYS `executive`; unknown body fields (e.g. `role`) are rejected."""
    if await get_user_by_email(session, body.email) is None:
        try:
            user = await create_user(session, email=body.email, password=body.password,
                                     full_name=body.full_name, role=Role.executive, verified=False)
            await session.commit()
            code = await issue_otp(user.email)
            bg.add_task(mail_service.send_otp_email, user.email, user.full_name, code)
        except IntegrityError:
            await session.rollback()
    return GENERIC_SENT  # identical response whether or not the email already exists (no enumeration)


@router.post("/resend-otp", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(rate_limit("resend-otp"))])
async def resend_otp(body: ResendOtpRequest, bg: BackgroundTasks, session: AsyncSession = Depends(get_session)):
    user = await get_user_by_email(session, body.email)
    if user and not user.is_verified and user.is_active:
        code = await issue_otp(user.email)
        bg.add_task(mail_service.send_otp_email, user.email, user.full_name, code)
    return GENERIC_SENT


@router.post("/verify-otp", response_model=MessageResponse, dependencies=[Depends(rate_limit("verify-otp"))])
async def verify_otp_endpoint(body: VerifyOtpRequest, session: AsyncSession = Depends(get_session)):
    user = await get_user_by_email(session, body.email)
    if user is None or not await verify_otp(body.email, body.otp):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")
    user.is_verified = True
    session.add(user)
    await session.commit()
    return MessageResponse(message="Account verified")


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit("login"))])
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    user = await get_user_by_email(session, body.email)
    ok = await verify_password(body.password, user.hashed_password if user else None)
    if not user or not ok or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account not verified. Check your email for the OTP.")
    pair = await issue_token_pair(user.id, user.role.value)
    return TokenResponse(access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    try:
        claims, family = await rotate_refresh_token(body.refresh_token)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc
    user = await session.get(User, int(claims["sub"]))
    if user is None or not user.is_active or not user.is_verified:
        await revoke_family(family)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account unavailable")
    pair = await issue_token_pair(user.id, user.role.value, family=family)  # rotation within the same family
    return TokenResponse(access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in)


@router.post("/logout", response_model=MessageResponse)
async def logout(body: LogoutRequest | None = None, claims: dict = Depends(get_access_claims),
                 _user: User = Depends(get_current_user)):
    await blacklist_token(claims)
    await revoke_family(claims["fam"])
    if body and body.refresh_token:
        try:
            refresh_claims = decode_token(body.refresh_token, "refresh")
            if refresh_claims["sub"] == claims["sub"]:
                await blacklist_token(refresh_claims)
        except TokenError:
            pass
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)):
    return user
