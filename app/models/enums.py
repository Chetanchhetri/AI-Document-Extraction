import enum


class Role(str, enum.Enum):
    super_admin = "super_admin"
    manager = "manager"
    executive = "executive"


ROLE_RANK = {Role.executive: 1, Role.manager: 2, Role.super_admin: 3}


class ShipmentStatus(str, enum.Enum):
    ingested = "ingested"
    processing = "processing"
    needs_review = "needs_review"
    approved = "approved"
    exported = "exported"


class DocType(str, enum.Enum):
    invoice = "invoice"
    packing_list = "packing_list"
    bill_of_lading = "bill_of_lading"


class CheckStatus(str, enum.Enum):
    passed = "passed"
    failed = "failed"
    overridden = "overridden"


class ExtractionStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    manual_review = "manual_review"  # AI output unusable -> human must key the values in
