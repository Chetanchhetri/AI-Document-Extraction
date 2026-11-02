"""End-to-end smoke test: auth, RBAC, upload hardening, extraction, cross-checks, gatekeeper, export, analytics."""
import io
import re

import httpx
import pymupdf
import pytest
from openpyxl import load_workbook
from sqlmodel import select

from app.core.config import settings
from app.core.database import async_session_factory
from app.main import app
from app.models import AuditLog, Document, ExtractedField
from app.services import mail_service

API = "/api/v1"
OTPS: dict[str, str] = {}


@pytest.fixture(scope="session", autouse=True)
async def lifespan_ctx():
    async with app.router.lifespan_context(app):
        yield


@pytest.fixture(autouse=True)
def capture_otp(monkeypatch):
    async def fake(email, full_name, code):
        OTPS[email] = code

    monkeypatch.setattr(mail_service, "send_otp_email", fake)


@pytest.fixture(scope="session")
async def client(lifespan_ctx):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def login(client, email, password):
    r = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": f"Bearer {tok['access_token']}"}


def make_pdf(text="doc", js=False) -> bytes:
    d = pymupdf.open()
    d.new_page().insert_text((50, 50), text)
    if js:
        d.xref_set_key(d.pdf_catalog(), "OpenAction", "<</S/JavaScript/JS(app.alert\\(1\\))>>")
    out = d.tobytes()
    d.close()
    return out


@pytest.fixture(scope="session")
async def tokens(client):
    return {
        "admin": await login(client, "admin@customs.example", "AdminPass123"),
        "manager": await login(client, "manager@customs.example", "DemoPass12345"),
        "exec": await login(client, "executive@customs.example", "DemoPass12345"),
    }


async def shipment_id(client, tok, code):
    rows = (await client.get(f"{API}/shipments?limit=200", headers=H(tok))).json()
    return next(s["id"] for s in rows if s["shipment_code"] == code)


# ------------------------------------------------------------------------------------ auth
async def test_signup_otp_login_and_mass_assignment(client):
    r = await client.post(f"{API}/auth/signup", json={"email": "evil@x.com", "password": "Passw0rdPass1",
                                                       "full_name": "Evil", "role": "super_admin"})
    assert r.status_code == 422  # extra field rejected
    body = {"email": "new.exec@customs.example", "password": "Passw0rdPass1", "full_name": "New Exec"}
    assert (await client.post(f"{API}/auth/signup", json=body)).status_code == 202
    assert (await client.post(f"{API}/auth/signup", json=body)).status_code == 202  # no enumeration
    r = await client.post(f"{API}/auth/login", json={"email": body["email"], "password": body["password"]})
    assert r.status_code == 403  # unverified
    assert (await client.post(f"{API}/auth/verify-otp", json={"email": body["email"], "otp": "000000"})).status_code == 400
    code = OTPS[body["email"]]
    assert (await client.post(f"{API}/auth/verify-otp", json={"email": body["email"], "otp": code})).status_code == 200
    tok = await login(client, body["email"], body["password"])
    me = (await client.get(f"{API}/auth/me", headers=H(tok))).json()
    assert me["role"] == "executive" and me["is_verified"]
    assert (await client.get(f"{API}/users", headers=H(tok))).status_code == 403


async def test_refresh_rotation_reuse_and_logout(client):
    tok = await login(client, "executive@customs.example", "DemoPass12345")
    r1 = await client.post(f"{API}/auth/refresh", json={"refresh_token": tok["refresh_token"]})
    assert r1.status_code == 200
    replay = await client.post(f"{API}/auth/refresh", json={"refresh_token": tok["refresh_token"]})
    assert replay.status_code == 401  # reuse detected
    after = await client.post(f"{API}/auth/refresh", json={"refresh_token": r1.json()["refresh_token"]})
    assert after.status_code == 401  # whole family revoked
    tok2 = await login(client, "executive@customs.example", "DemoPass12345")
    assert (await client.get(f"{API}/auth/me", headers=H(tok2))).status_code == 200
    assert (await client.post(f"{API}/auth/logout", headers=H(tok2), json={})).status_code == 200
    assert (await client.get(f"{API}/auth/me", headers=H(tok2))).status_code == 401


async def test_rate_limit_resend_otp(client):
    settings.AUTH_RATE_LIMIT_MAX = 5
    try:
        codes = [(await client.post(f"{API}/auth/resend-otp", json={"email": "nobody@x.com"})).status_code for _ in range(7)]
    finally:
        settings.AUTH_RATE_LIMIT_MAX = 100
    assert codes[:5] == [202] * 5 and codes[5] == 429


# ------------------------------------------------------------------------------------ seeded scenarios
async def test_seeded_locked_shipment_override_and_export(client, tokens):
    sid = await shipment_id(client, tokens["exec"], "SHP-24811")
    r = await client.get(f"{API}/shipments/{sid}/export", headers=H(tokens["exec"]))
    assert r.status_code == 422
    blockers = r.json()["detail"]["blockers"]
    assert any(b["type"] == "CROSS_CHECK_FAILED" and "45 kg" in b["detail"] for b in blockers)
    review = (await client.get(f"{API}/shipments/{sid}/review", headers=H(tokens["exec"]))).json()
    check = next(c for c in review["cross_checks"] if c["check_name"] == "WEIGHT_MATCH_INV_VS_PL")
    assert check["variance_note"] == "Mismatch of 45 kg between Invoice (3120 kg) and Packing List (3165 kg)"
    url = f"{API}/shipments/{sid}/cross-checks/{check['id']}/override"
    assert (await client.post(url, headers=H(tokens["exec"]), json={"override_reason": "long enough reason"})).status_code == 403
    assert (await client.post(url, headers=H(tokens["manager"]), json={"override_reason": "short"})).status_code == 422
    ok = await client.post(url, headers=H(tokens["manager"]), json={"override_reason": "Pallet weight confirmed with supplier"})
    assert ok.status_code == 200 and ok.json()["status"] == "overridden"
    exp = await client.get(f"{API}/shipments/{sid}/export", headers=H(tokens["exec"]))
    assert exp.status_code == 200
    ws = load_workbook(io.BytesIO(exp.content)).active
    cells = [str(c.value) for row in ws.iter_rows() for c in row if c.value is not None]
    assert "SHP-24811" in cells and "LED panel light 40W" in cells and "PASSED WITH MANAGER OVERRIDE" in cells
    async with async_session_factory() as s:
        log = (await s.exec(select(AuditLog).where(AuditLog.action == "CHECK_OVERRIDDEN"))).first()
        assert log and "Pallet weight" in log.new_value


async def test_seeded_valid_shipment_verify_all_then_export(client, tokens):
    sid = await shipment_id(client, tokens["exec"], "SHP-24812")
    r = await client.get(f"{API}/shipments/{sid}/export", headers=H(tokens["exec"]))
    assert r.status_code == 422 and r.json()["detail"]["blockers"][0]["type"] == "LOW_CONFIDENCE_UNVERIFIED"
    assert (await client.post(f"{API}/shipments/{sid}/verify-all", headers=H(tokens["exec"]))).status_code == 200
    assert (await client.get(f"{API}/shipments/{sid}/export", headers=H(tokens["exec"]))).status_code == 200
    # exported shipments are locked
    assert (await client.post(f"{API}/shipments/{sid}/verify-all", headers=H(tokens["exec"]))).status_code == 409


async def test_hsn_suggest(client, tokens):
    r = await client.post(f"{API}/hsn/suggest", headers=H(tokens["exec"]), json={"description": "LED panel light 40W"})
    assert r.status_code == 200 and r.json()[0]["hsn_code"] == "940542"
    r = await client.post(f"{API}/hsn/suggest", headers=H(tokens["exec"]), json={"description": "Steel ball valve DN50"})
    assert r.json()[0]["hsn_code"] == "848180"


# ------------------------------------------------------------------------------------ pipeline
async def test_upload_extract_edit_export_pipeline(client, tokens):
    tok = tokens["exec"]
    sh = (await client.post(f"{API}/shipments", headers=tok and H(tok), json={"supplier_name": "Company B (China)"})).json()
    sid = sh["id"]
    assert sh["shipment_code"].startswith("SHP-")

    # --- upload hardening
    bad = await client.post(f"{API}/shipments/{sid}/documents", headers=H(tok), data={"doc_type": "invoice"},
                            files={"file": ("../../etc/passwd.pdf", b"not a pdf at all", "application/pdf")})
    assert bad.status_code == 415  # magic bytes beat extension/content-type
    too_big = await client.post(f"{API}/shipments/{sid}/documents", headers=H(tok), data={"doc_type": "invoice"},
                                files={"file": ("big.pdf", b"%PDF-" + b"0" * (settings.MAX_UPLOAD_BYTES + 10), "application/pdf")})
    assert too_big.status_code == 413
    broken = await client.post(f"{API}/shipments/{sid}/documents", headers=H(tok), data={"doc_type": "invoice"},
                               files={"file": ("x.pdf", b"%PDF-1.4 garbage", "application/pdf")})
    assert broken.status_code == 422

    # --- real uploads (invoice carries JS + hostile filename)
    inv = await client.post(f"{API}/shipments/{sid}/documents", headers=H(tok), data={"doc_type": "invoice"},
                            files={"file": ("../../evil name.pdf", make_pdf("invoice", js=True), "application/pdf")})
    assert inv.status_code == 202, inv.text
    assert "/" not in inv.json()["file_name"] and "\\" not in inv.json()["file_name"]
    dup = await client.post(f"{API}/shipments/{sid}/documents", headers=H(tok), data={"doc_type": "invoice"},
                            files={"file": ("again.pdf", make_pdf("invoice", js=True), "application/pdf")})
    assert dup.status_code == 409
    for dt in ("packing_list", "bill_of_lading"):
        r = await client.post(f"{API}/shipments/{sid}/documents", headers=H(tok), data={"doc_type": dt},
                              files={"file": (f"{dt}.pdf", make_pdf(dt), "application/pdf")})
        assert r.status_code == 202, r.text

    async with async_session_factory() as s:
        docs = (await s.exec(select(Document).where(Document.shipment_id == sid))).all()
        stored = {d.doc_type.value: open(d.file_path, "rb").read() for d in docs}
        assert all(re.search(r"/storage/shipments/\d+/[0-9a-f]{32}\.pdf$", d.file_path.replace("\\", "/")) for d in docs)
        assert b"JavaScript" not in stored["invoice"] and b"/JS" not in stored["invoice"]
        pii = (await s.exec(select(ExtractedField).where(ExtractedField.shipment_id == sid,
                                                        ExtractedField.field_name == "importer_email"))).one()
        assert pii.field_value.startswith("enc:v1:") and "importer.example" not in pii.field_value

    review = (await client.get(f"{API}/shipments/{sid}/review", headers=H(tok))).json()
    assert review["shipment"]["status"] == "needs_review" and not review["export_ready"]
    inv_fields = {f["field_name"]: f for d in review["documents"] if d["document"]["doc_type"] == "invoice" for f in d["fields"]}
    assert inv_fields["importer_email"]["field_value"] == "rahul.sharma@importer.example"  # decrypted for reviewers
    assert set(inv_fields["gross_weight_kg"]["bounding_box"]) == {"x", "y", "w", "h", "page"}
    checks = {c["check_name"]: c for c in review["cross_checks"]}
    assert checks["WEIGHT_MATCH_INV_VS_PL"]["status"] == "failed"
    assert checks["MATH_LINE_ITEMS_VS_INVOICE_TOTAL"]["status"] == "passed"
    assert checks["PACKAGE_COUNT_MATCH"]["status"] == "passed"
    assert (await client.get(f"{API}/shipments/{sid}/export", headers=H(tok))).status_code == 422

    # executive corrects the weight (edit) -> check passes; low-confidence incoterms verified
    gw = inv_fields["gross_weight_kg"]
    r = await client.patch(f"{API}/shipments/{sid}/fields/{gw['id']}", headers=H(tok), json={"value": "3165"})
    assert r.status_code == 200 and r.json()["is_human_verified"]
    # PII edit -> audit trail must hold masked values only
    em = inv_fields["importer_email"]
    await client.patch(f"{API}/shipments/{sid}/fields/{em['id']}", headers=H(tok), json={"value": "new.person@importer.example"})
    inc = inv_fields["incoterms"]
    assert inc["is_low_confidence"] and not inc["is_human_verified"]
    assert (await client.get(f"{API}/shipments/{sid}/export", headers=H(tok))).status_code == 422  # still unverified
    assert (await client.patch(f"{API}/shipments/{sid}/fields/{inc['id']}", headers=H(tok), json={})).status_code == 200
    exp = await client.get(f"{API}/shipments/{sid}/export", headers=H(tok))
    assert exp.status_code == 200, exp.text

    async with async_session_factory() as s:
        logs = (await s.exec(select(AuditLog).where(AuditLog.extracted_field_id == em["id"]))).all()
        assert logs and all("importer.example" not in (l.new_value or "") and "@" in (l.new_value or "") and "***" in l.new_value for l in logs)

    # --- analytics
    assert (await client.get(f"{API}/analytics/accuracy", headers=H(tok))).status_code == 403
    a = (await client.get(f"{API}/analytics/accuracy", headers=H(tokens["manager"]))).json()
    b = next(x for x in a["by_supplier"] if x["supplier_name"] == "Company B (China)")
    assert b["weight_mismatches"] >= 1 and b["fields_edited"] >= 1
    assert any(f["field_name"] == "gross_weight_kg" for f in a["by_field"])


async def test_admin_user_management(client, tokens):
    r = await client.post(f"{API}/users", headers=H(tokens["admin"]), json={
        "email": "ops@customs.example", "full_name": "Ops", "role": "manager", "password": "OpsPassw0rd12"})
    assert r.status_code == 201 and r.json()["role"] == "manager" and not r.json()["is_verified"]
    users = (await client.get(f"{API}/users", headers=H(tokens["admin"]))).json()
    assert len(users) >= 4
    me = (await client.get(f"{API}/auth/me", headers=H(tokens["admin"]))).json()
    r = await client.patch(f"{API}/users/{me['id']}", headers=H(tokens["admin"]), json={"role": "executive"})
    assert r.status_code == 400
