## Authentication Flow

The platform uses a secure **SMTP OTP + Dual JWT (Access + Refresh Token)** authentication architecture with Redis-backed state management:

1. **Registration (`POST /api/v1/auth/signup`)**
   - New users sign up with `email`, `password`, and `full_name`.
   - Accounts are created in an unverified state (`is_verified=False`), and a 6-digit cryptographic OTP is generated and stored in Redis (10-minute expiry).
   - An email containing the OTP is sent asynchronously via SMTP.

2. **OTP Verification (`POST /api/v1/auth/verify-otp`)**
   - The user submits their `email` and 6-digit `otp`.
   - Once verified against Redis, the account status is updated to active (`is_verified=True`, `is_active=True`).

3. **Login (`POST /api/v1/auth/login`)**
   - Authenticates user credentials using **Argon2id** password hashing.
   - Upon successful verification, returns a short-lived **Access Token** (15 mins) and a long-lived **Refresh Token** (7 days).

4. **Token Refresh & Logout**
   - **Refresh (`POST /api/v1/auth/refresh`):** Exchanges a valid Refresh Token for a new Access Token.
   - **Logout (`POST /api/v1/auth/logout`):** Immediately blacklists the current JWT Access Token in Redis to prevent reuse.